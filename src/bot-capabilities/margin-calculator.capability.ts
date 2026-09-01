import { Injectable } from '@nestjs/common';
import { formatMarginReply } from '../teams/message-formatter';
import { BotCapability, CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { parseAmount } from './parse-amount.util';

// Precio de costo: "cuesta 34000", "costo 34.000", "compra a 34000", "pagué 34000".
const COST_RE =
  /(?:me\s+cuesta|cuesta|costo|coste|compr[oaé]|pagu[ée]|pago)\s*(?:a|en|de|por|:|=)?\s*\$?\s*(\d[\d.,]*\d|\d)/i;

// Precio de venta: "lo vendo en 40000", "venta a 40000", "precio 85.000", "pvp 40000".
const SALE_RE =
  /(?:lo\s+vendo|se\s+vende|precio\s+de\s+venta|precio|vendo|venta|vender|pvp)\s*(?:a|en|de|por|:|=)?\s*\$?\s*(\d[\d.,]*\d|\d)/i;

/**
 * "Cuesta 34.000 y lo vendo en 40.000, ¿qué margen me da?" — calculadora de
 * margen costo/venta sobre montos que da el vendedor en la misma frase (no
 * toca su historial ni el stock).
 *
 * Solo matchea si aparecen AMBOS precios de forma clara; si no, deja que
 * respondan otra capacidad o el fallback — no inventa números.
 */
@Injectable()
export class MarginCalculatorCapability implements BotCapability {
  readonly name = 'margin-calculator';

  constructor(private readonly memory: ConversationMemoryService) {}

  canHandle(text: string, _ctx: CapabilityContext): boolean {
    return this.extract(text) !== undefined;
  }

  async handle(text: string, ctx: CapabilityContext): Promise<string> {
    const parsed = this.extract(text);
    if (!parsed) {
      // canHandle ya lo filtró; defensivo por si se llama directo.
      return 'Necesito el precio de costo y el de venta, ej. "cuesta 34.000 y lo vendo en 40.000".';
    }

    const { cost, sale } = parsed;
    this.memory.update(ctx.conversationId, {
      lastIntent: 'margin',
      lastMargin: { cost, sale },
    });

    return formatMarginReply(computeMargin(cost, sale));
  }

  /** Devuelve { cost, sale } solo si ambos montos están claros. */
  private extract(text: string): { cost: number; sale: number } | undefined {
    const costMatch = text.match(COST_RE);
    const saleMatch = text.match(SALE_RE);
    if (!costMatch || !saleMatch) return undefined;

    const cost = parseAmount(costMatch[1]);
    const sale = parseAmount(saleMatch[1]);
    if (cost === undefined || sale === undefined) return undefined;

    return { cost, sale };
  }
}

/** Cálculo de margen — compartido con FollowUpCapability. */
export function computeMargin(cost: number, sale: number) {
  const profit = sale - cost;
  return {
    cost,
    sale,
    profit,
    marginOnSalePct: (profit / sale) * 100,
    markupOnCostPct: (profit / cost) * 100,
  };
}
