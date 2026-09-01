import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { HELP_TEXT } from '../teams/message-formatter';
import { BotCapability, CapabilityContext } from './bot-capability.interface';
import {
  ConversationMemory,
  ConversationMemoryService,
} from './conversation-memory.service';

// El fallback solo responde consultas simples de vendedores, así que por
// defecto usa el modelo más barato. Se puede subir con ANTHROPIC_MODEL.
const DEFAULT_MODEL = 'claude-haiku-4-5';

const SYSTEM_PROMPT = [
  'Sos el asistente de ventas de una empresa, dentro de Microsoft Teams.',
  'Los que te escriben son vendedores. Temas que manejás: stock por precio,',
  'comisiones y margen del vendedor, proyecciones de venta, y consejos',
  'comerciales generales (cómo presentar un producto, responder objeciones, etc.).',
  '',
  'Reglas:',
  '- Respondé en español rioplatense, breve y concreto (2-4 frases).',
  '- No inventes datos de stock, precios ni números de comisión: si hace falta un',
  '  dato puntual, decí que lo consulten con una pregunta más específica.',
  '- Si la pregunta no tiene nada que ver con ventas, respondé cortésmente que',
  '  ese no es tu tema.',
  '- No uses encabezados ni listas largas; es un chat.',
].join('\n');

/**
 * Última carta del router (ADR-005): las preguntas que ninguna capacidad de
 * reglas reconoce se responden con Claude. Si no hay ANTHROPIC_API_KEY
 * configurada, `canHandle` devuelve false y el router cae al mensaje de ayuda
 * fijo — el bot sigue funcionando sin la IA.
 */
@Injectable()
export class AiFallbackCapability implements BotCapability {
  readonly name = 'ai-fallback';
  private readonly logger = new Logger('AiFallbackCapability');
  private readonly client: Anthropic | null;
  private readonly model: string;

  constructor(
    private readonly memory: ConversationMemoryService,
    config: ConfigService,
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
    this.logger.log(
      `Fallback de IA ${this.client ? `activo (modelo ${this.model})` : 'inactivo (sin ANTHROPIC_API_KEY)'}`,
    );
  }

  canHandle(text: string, _ctx: CapabilityContext): boolean {
    // Catch-all, pero solo si hay IA disponible.
    return this.client !== null && text.trim().length > 0;
  }

  async handle(text: string, ctx: CapabilityContext): Promise<string> {
    if (!this.client) return HELP_TEXT;

    const mem = this.memory.get(ctx.conversationId);
    const context = describeMemory(mem);
    const userContent = context
      ? `Contexto de lo último que hablamos: ${context}\n\nPregunta: ${text}`
      : text;

    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }],
      });

      const answer = response.content
        .filter((block): block is Anthropic.TextBlock => block.type === 'text')
        .map((block) => block.text)
        .join('')
        .trim();

      return answer || HELP_TEXT;
    } catch (error) {
      if (error instanceof Anthropic.APIError) {
        this.logger.warn(`Claude no disponible (${error.status}): ${error.message}`);
      } else {
        this.logger.warn(`Fallo llamando a Claude: ${String(error)}`);
      }
      return HELP_TEXT;
    }
  }
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
    parts.push(`comisión ${(mem.lastCommissionRate * 100).toFixed(2).replace(/\.?0+$/, '')}%`);
  }
  if (mem.lastMargin) {
    parts.push(`costo $${mem.lastMargin.cost} / venta $${mem.lastMargin.sale}`);
  }
  return parts.length ? parts.join(', ') : null;
}
