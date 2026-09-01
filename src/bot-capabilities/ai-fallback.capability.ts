import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { StockService } from '../stock/stock.service';
import { SalesService } from '../sales/sales.service';
import { BOT_TENANT_ID } from '../teams/teams.constants';
import { HELP_TEXT } from '../teams/message-formatter';
import { BotCapability, CapabilityContext } from './bot-capability.interface';
import {
  ConversationMemory,
  ConversationMemoryService,
} from './conversation-memory.service';
import { computeMargin } from './margin-calculator.capability';
import { computeProjection } from './sale-projection.capability';
import { currentMonth } from './current-month.util';

// El fallback solo responde consultas simples de vendedores, así que por
// defecto usa el modelo más barato. Se puede subir con ANTHROPIC_MODEL.
const DEFAULT_MODEL = 'claude-haiku-4-5';
// Corta el loop de tools por si el modelo se queda pidiendo herramientas.
const MAX_ITERATIONS = 5;

// Registro fijo + contrato de honestidad + prioridad de herramientas (ADR-006).
const SYSTEM_PROMPT = [
  'Eres el asistente de ventas de una empresa, integrado en Microsoft Teams.',
  'Quienes te escriben son vendedores.',
  '',
  'Registro:',
  '- Responde siempre en español neutro y formal. No uses modismos ni jerga de',
  '  ningún país (ni rioplatenses, ni chilenos, ni de ningún otro). Nada de',
  '  "che", "boludo", "weón", "¡Ey!", apodos ni emojis.',
  '- Tono profesional y cordial. Frases claras y directas, 2 a 4 oraciones',
  '  salvo que se pida más detalle.',
  '',
  'Cómo respondes:',
  '- Si la pregunta se puede responder con una de tus herramientas internas',
  '  (consultar_stock, calcular_margen, resumen_comision, proyectar_venta), USA',
  '  la herramienta. No pidas más precisión antes de intentarlo: si el vendedor',
  '  pide "el stock", "lo disponible" o "el inventario" sin dar rango de precio',
  '  ni producto, llama a consultar_stock SIN filtros para traer el catálogo',
  '  completo.',
  '- Usa la herramienta de búsqueda web (web_search) SIEMPRE que la pregunta',
  '  necesite datos externos o actuales que no están en el sistema. Esto',
  '  incluye, y no te limites a estos ejemplos:',
  '    • el precio de un producto puntual en un competidor, marketplace o',
  '      tienda (ej. "¿a cuánto está el iPhone 15 en Falabella?", "precio del',
  '      Galaxy S23 en MercadoLibre", "cuánto sale el Moto G34 afuera",',
  '      "qué precio tiene la competencia para el Redmi Note 13");',
  '    • precios de referencia o rango de mercado de un producto;',
  '    • novedades, specs o disponibilidad de productos nuevos;',
  '    • cualquier dato de contexto de mercado o competencia.',
  '  El precio interno del catálogo (consultar_stock) es OTRA cosa que el',
  '  precio en la competencia: si preguntan por el precio "afuera", "en otro',
  '  lado", "en la competencia" o nombran una tienda, es web_search, aunque el',
  '  producto también exista en el catálogo. Cita siempre la fuente y la fecha',
  '  si la tienes. Si la búsqueda no devuelve un precio claro, dilo.',
  '  Si la pregunta de precio no indica país, asume CHILE: el catálogo interno',
  '  está en pesos chilenos, así que busca en tiendas chilenas y responde en',
  '  pesos chilenos (CLP). Solo cambia de país o moneda si el usuario lo pide.',
  '- NUNCA uses búsqueda web para datos propios del sistema (stock del catálogo,',
  '  comisión, margen): esos salen siempre de las herramientas internas.',
  '- Si ninguna herramienta puede responder (un producto que no existe, un dato',
  '  realmente fuera de alcance), dilo en una sola frase honesta: "No cuento con',
  '  esa información." No inventes limitaciones de acceso que no son ciertas: el',
  '  stock y las comisiones SÍ están disponibles a través de tus herramientas.',
  '  No encadenes más de una pregunta aclaratoria antes de intentar responder',
  '  con lo que ya tienes.',
  '- No uses encabezados de Markdown ni listas largas: es un chat.',
].join('\n');

/**
 * Última carta del router (ADR-005 + ADR-006): las preguntas que ninguna
 * capacidad de reglas reconoce se responden con Claude, que tiene como
 * herramientas las mismas operaciones internas (stock, margen, comisión,
 * proyección) más búsqueda web para contexto externo. Sin ANTHROPIC_API_KEY
 * `canHandle` devuelve false y el router cae al mensaje de ayuda fijo.
 */
@Injectable()
export class AiFallbackCapability implements BotCapability {
  readonly name = 'ai-fallback';
  private readonly logger = new Logger('AiFallbackCapability');
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly webSearchEnabled: boolean;

  constructor(
    private readonly memory: ConversationMemoryService,
    config: ConfigService,
    private readonly stockService: StockService,
    private readonly salesService: SalesService,
  ) {
    const read = (key: string): string | undefined =>
      config.get<string>(key) || process.env[key];

    const apiKey = read('ANTHROPIC_API_KEY');
    // Las API keys asociadas a un workspace exigen este header.
    const workspaceId = read('ANTHROPIC_WORKSPACE_ID');
    this.client = apiKey
      ? new Anthropic({
          apiKey,
          ...(workspaceId
            ? { defaultHeaders: { 'anthropic-workspace-id': workspaceId } }
            : {}),
        })
      : null;
    this.model = read('ANTHROPIC_MODEL') || DEFAULT_MODEL;
    this.webSearchEnabled = !/^(0|false|off|no)$/i.test(read('ANTHROPIC_WEB_SEARCH') ?? '');

    this.logger.log(
      this.client
        ? `Fallback de IA activo (modelo ${this.model}, búsqueda web ${this.webSearchEnabled ? 'on' : 'off'})`
        : 'Fallback de IA inactivo (sin ANTHROPIC_API_KEY)',
    );
  }

  canHandle(text: string, _ctx: CapabilityContext): boolean {
    // Catch-all, pero solo si hay IA disponible.
    return this.client !== null && text.trim().length > 0;
  }

  async handle(text: string, ctx: CapabilityContext): Promise<string> {
    if (!this.client) return HELP_TEXT;

    const memNote = describeMemory(this.memory.get(ctx.conversationId));

    // Historial reciente del hilo (usuario + bot) para sostener preguntas
    // abiertas encadenadas; el store ya lo tiene acotado a los últimos turnos.
    const messages: Anthropic.MessageParam[] = this.memory
      .getTranscript(ctx.conversationId)
      .map((turn) => ({
        role: turn.role === 'user' ? ('user' as const) : ('assistant' as const),
        content: turn.text,
      }));
    while (messages.length && messages[0].role !== 'user') messages.shift();

    messages.push({
      role: 'user',
      content: memNote ? `(Contexto del último cálculo: ${memNote})\n\n${text}` : text,
    });

    try {
      for (let i = 0; i < MAX_ITERATIONS; i++) {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 1024,
          system: SYSTEM_PROMPT,
          tools: this.toolDefinitions(),
          messages,
        });

        if (response.stop_reason === 'pause_turn') {
          // La búsqueda web (server-side) pausó; se reenvía para que continúe.
          messages.push({ role: 'assistant', content: response.content });
          continue;
        }

        const toolUses = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
        );

        if (response.stop_reason !== 'tool_use' || toolUses.length === 0) {
          return extractText(response) || HELP_TEXT;
        }

        messages.push({ role: 'assistant', content: response.content });
        const results: Anthropic.ToolResultBlockParam[] = [];
        for (const use of toolUses) {
          results.push({
            type: 'tool_result',
            tool_use_id: use.id,
            content: await this.runTool(use.name, use.input, ctx),
          });
        }
        messages.push({ role: 'user', content: results });
      }

      this.logger.warn('El fallback de IA agotó las iteraciones de tools.');
      return HELP_TEXT;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        this.logger.warn(`Claude no disponible (${error.status}): ${error.message}`);
      } else {
        this.logger.warn(`Fallo llamando a Claude: ${String(error)}`);
      }
      return HELP_TEXT;
    }
  }

  /** Herramientas internas + (opcional) búsqueda web nativa de Anthropic. */
  private toolDefinitions() {
    const tools: Anthropic.Messages.ToolUnion[] = [
      {
        name: 'consultar_stock',
        description:
          'Devuelve productos en stock. SIN parámetros devuelve el catálogo completo. minPrice/maxPrice filtran por precio; category filtra por categoría (ej. "telefono").',
        input_schema: {
          type: 'object',
          properties: {
            minPrice: { type: 'number', description: 'Precio mínimo (opcional)' },
            maxPrice: { type: 'number', description: 'Precio máximo (opcional)' },
            category: { type: 'string', description: 'Categoría (opcional)' },
          },
        },
      },
      {
        name: 'calcular_margen',
        description:
          'Calcula ganancia, margen sobre venta y markup sobre costo a partir de un precio de costo y uno de venta.',
        input_schema: {
          type: 'object',
          properties: {
            costo: { type: 'number' },
            venta: { type: 'number' },
          },
          required: ['costo', 'venta'],
        },
      },
      {
        name: 'proyectar_venta',
        description:
          'Proyecta el ingreso total y la comisión del vendedor para una venta hipotética.',
        input_schema: {
          type: 'object',
          properties: {
            cantidad: { type: 'number' },
            precioUnitario: { type: 'number' },
            tasaComision: { type: 'number', description: 'Ej. 0.08 para 8%' },
          },
          required: ['cantidad', 'precioUnitario', 'tasaComision'],
        },
      },
      {
        name: 'resumen_comision',
        description:
          'Resumen de ventas y comisión del mes en curso para el vendedor que pregunta. tasaComision opcional (ej. 0.08); si no se pasa, se usa el default del vendedor.',
        input_schema: {
          type: 'object',
          properties: {
            tasaComision: { type: 'number', description: 'Ej. 0.08 para 8% (opcional)' },
          },
        },
      },
    ];

    if (this.webSearchEnabled) {
      // Variante básica: compatible con Haiku 4.5 y con modelos más nuevos.
      tools.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 });
    }

    return tools;
  }

  private async runTool(
    name: string,
    input: unknown,
    ctx: CapabilityContext,
  ): Promise<string> {
    const args = (input ?? {}) as Record<string, unknown>;
    try {
      switch (name) {
        case 'consultar_stock': {
          const items = await this.stockService.queryStock(BOT_TENANT_ID, {
            minPrice: numOrUndef(args.minPrice),
            maxPrice: numOrUndef(args.maxPrice),
            category: typeof args.category === 'string' ? args.category : undefined,
          });
          return JSON.stringify({ count: items.length, items });
        }
        case 'calcular_margen': {
          const costo = numOrUndef(args.costo);
          const venta = numOrUndef(args.venta);
          if (!costo || !venta || costo <= 0 || venta <= 0) {
            return 'Error: costo y venta deben ser números positivos.';
          }
          return JSON.stringify(computeMargin(costo, venta));
        }
        case 'proyectar_venta': {
          const cantidad = numOrUndef(args.cantidad);
          const precioUnitario = numOrUndef(args.precioUnitario);
          const tasaComision = numOrUndef(args.tasaComision);
          if (
            !cantidad ||
            cantidad <= 0 ||
            !precioUnitario ||
            precioUnitario <= 0 ||
            tasaComision === undefined ||
            tasaComision < 0
          ) {
            return 'Error: cantidad y precioUnitario deben ser positivos y tasaComision >= 0.';
          }
          return JSON.stringify(
            computeProjection(cantidad, precioUnitario, tasaComision),
          );
        }
        case 'resumen_comision': {
          try {
            const summary = await this.salesService.getMonthlySummary(
              ctx.sellerId,
              currentMonth(),
              numOrUndef(args.tasaComision),
            );
            return JSON.stringify(summary);
          } catch (error) {
            if (error instanceof BadRequestException) return String(error.message);
            throw error;
          }
        }
        default:
          return `Herramienta desconocida: ${name}`;
      }
    } catch (error) {
      this.logger.warn(`La herramienta ${name} falló: ${String(error)}`);
      return `No se pudo ejecutar ${name}.`;
    }
  }
}

function numOrUndef(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}

function describeMemory(mem: ConversationMemory): string | null {
  const parts: string[] = [];
  if (mem.lastProduct) {
    parts.push(`producto "${mem.lastProduct.name}" a $${mem.lastProduct.price}`);
  }
  if (mem.lastUnitPrice !== undefined && !mem.lastProduct) {
    parts.push(`precio unitario $${mem.lastUnitPrice}`);
  }
  if (mem.lastQuantity !== undefined) parts.push(`cantidad ${mem.lastQuantity}`);
  if (mem.lastCommissionRate !== undefined) {
    parts.push(
      `comisión ${(mem.lastCommissionRate * 100).toFixed(2).replace(/\.?0+$/, '')}%`,
    );
  }
  if (mem.lastMargin) {
    parts.push(`costo $${mem.lastMargin.cost} / venta $${mem.lastMargin.sale}`);
  }
  return parts.length ? parts.join(', ') : null;
}
