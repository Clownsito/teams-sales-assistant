import { Injectable } from '@nestjs/common';
import { IntentParserService } from '../intent/intent-parser.service';
import { StockService } from '../stock/stock.service';
import { BOT_TENANT_ID } from '../teams/teams.constants';
import { formatProjectionReply, ProjectionResult } from '../teams/message-formatter';
import { BotCapability, CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { parseAmount } from './parse-amount.util';

// Solo una proyección explícitamente hipotética ("si vendo...", "proyección",
// "simular") — así no le roba la pregunta a la del resumen mensual real.
const PROJECTION_INTENT_RE =
  /\bsi\s+(?:vendo|vendiera|vendiese|vendieras|coloco|colocara|logro\s+vender|llego\s+a\s+vender)\b|\bvendiendo\s+\d|\bproyect|\bsimul/i;

// Cantidad: "vendo 50", "vendo 50 teléfonos", "50 unidades".
const QUANTITY_RE =
  /(?:vendo|vendiera|vendiese|coloco|colocar|vender)\s+(?:unos?\s+|unas?\s+)?(\d+)|(\d+)\s*(?:unidades?|equipos?|productos?|art[ií]culos?|tel[eé]fonos?|celulares?|iphones?)\b/i;

// Precio unitario: "a 30000", "en 30000", "cada uno 30000", "unitario 30000".
const UNIT_PRICE_RE =
  /(?:\ba\b|\ben\b|c\/u|cada\s+uno|por\s+unidad|precio\s+unitario|unitario|precio\s+de)\s*\$?\s*(\d[\d.,]*\d|\d)/i;

/**
 * "¿Cuánto ganaría si vendo 50 teléfonos a 30.000 con 8% de comisión?" —
 * proyección hipotética. Necesita cantidad, precio unitario y % de comisión.
 * Si falta el precio pero se nombra un producto del stock, usa ese precio en
 * vez de volver a pedirlo. Si falta cualquier otro dato, lo pide — no asume.
 */
@Injectable()
export class SaleProjectionCapability implements BotCapability {
  readonly name = 'sale-projection';

  constructor(
    private readonly intentParser: IntentParserService,
    private readonly stockService: StockService,
    private readonly memory: ConversationMemoryService,
  ) {}

  canHandle(text: string, _ctx: CapabilityContext): boolean {
    return PROJECTION_INTENT_RE.test(text) && /\d/.test(text);
  }

  async handle(text: string, ctx: CapabilityContext): Promise<string> {
    // Sacar el "8%" del texto para que no se confunda con la cantidad o el precio.
    const withoutPercent = text.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ');

    const quantity = this.parseQuantity(withoutPercent);
    if (quantity === undefined) {
      return '¿Cuántas unidades querés proyectar? Ej. "si vendo 50 a 30.000 con 8% de comisión".';
    }

    const { commissionRate } = this.intentParser.parseSalesQuery(text);

    let unitPrice = this.parseUnitPrice(withoutPercent);
    let priceSource: string | undefined;
    if (unitPrice === undefined) {
      const fromStock = await this.findPriceInStock(text);
      if (fromStock) {
        unitPrice = fromStock.price;
        priceSource = fromStock.name;
      }
    }
    if (unitPrice === undefined) {
      return '¿A qué precio por unidad? O nombrá un producto del stock, ej. "si vendo 50 iPhone SE con 8% de comisión".';
    }

    if (commissionRate === undefined) {
      return '¿Con qué % de comisión? Ej. "si vendo 50 a 30.000 con 8% de comisión".';
    }

    this.memory.update(ctx.conversationId, {
      lastIntent: 'projection',
      lastQuantity: quantity,
      lastUnitPrice: unitPrice,
      lastCommissionRate: commissionRate,
      lastProduct: priceSource ? { name: priceSource, price: unitPrice } : undefined,
    });

    return formatProjectionReply(
      computeProjection(quantity, unitPrice, commissionRate, priceSource),
    );
  }

  private parseQuantity(text: string): number | undefined {
    const match = text.match(QUANTITY_RE);
    if (!match) return undefined;
    const value = Number(match[1] ?? match[2]);
    return Number.isInteger(value) && value > 0 ? value : undefined;
  }

  private parseUnitPrice(text: string): number | undefined {
    const match = text.match(UNIT_PRICE_RE);
    return match ? parseAmount(match[1]) : undefined;
  }

  private async findPriceInStock(
    text: string,
  ): Promise<{ name: string; price: number } | undefined> {
    const catalog = await this.stockService.queryStock(BOT_TENANT_ID, {});
    const haystack = text.toLowerCase();
    const found = catalog.find((item) => haystack.includes(item.name.toLowerCase()));
    return found ? { name: found.name, price: found.price } : undefined;
  }
}

/** Cálculo de proyección — compartido con FollowUpCapability. */
export function computeProjection(
  quantity: number,
  unitPrice: number,
  commissionRate: number,
  priceSource?: string,
): ProjectionResult {
  const totalRevenue = quantity * unitPrice;
  const commissionAmount = Math.round(totalRevenue * commissionRate * 100) / 100;
  return { quantity, unitPrice, commissionRate, totalRevenue, commissionAmount, priceSource };
}
