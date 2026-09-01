import { Injectable } from '@nestjs/common';
import { IntentParserService } from '../intent/intent-parser.service';
import {
  formatMarginReply,
  formatProjectionReply,
} from '../teams/message-formatter';
import { BotCapability, CapabilityContext } from './bot-capability.interface';
import {
  ConversationMemory,
  ConversationMemoryService,
} from './conversation-memory.service';
import { computeMargin } from './margin-calculator.capability';
import { computeProjection } from './sale-projection.capability';
import { parseAmount } from './parse-amount.util';

// "y si...", "¿y con...?", "entonces...", "en ese caso..." — arranca como seguimiento.
const FOLLOWUP_LEAD_RE = /^\s*¿?\s*(y|e|entonces|ahora|en ese caso|lo mismo)\b/i;
// ...o trae un modificador reconocible aunque no arranque con "y".
const MODIFIER_HINT_RE =
  /m[aá]s\s+(caro|barato)|el\s+doble|la\s+mitad|\bsube\b|\bbaja\b/i;

// "10% más caro" / "5% más barato" → factor multiplicativo sobre un precio.
const PCT_CHANGE_RE = /(\d+(?:[.,]\d+)?)\s*%\s+m[aá]s\s+(caro|barato)/i;
// "y si son 20", "con 30 unidades", "vendo 25" → nueva cantidad.
const QTY_RE =
  /(?:son|ser[ií]an|fueran|vendo|coloco|con)\s+(\d+)\s*(?:unidades?|equipos?|productos?|tel[eé]fonos?)?\b/i;
// "a 55.000", "precio 55000", "cada uno a 55000" → nuevo precio unitario absoluto.
const UNIT_PRICE_ABS_RE =
  /(?:\ba\b|precio(?:\s+(?:es|de|a))?|cada\s+uno\s+a?)\s*\$?\s*(\d[\d.,]*\d|\d)/i;
// "el costo sube a 36.000", "costo de 36000" → nuevo costo absoluto.
const COST_ABS_RE =
  /costo\s+(?:sube|baja|es|fuera|pasa\s+a|queda\s+en|de)\s+a?\s*(\d[\d.,]*\d|\d)/i;
// "el costo sube 10%", "costo baja 5%" → factor sobre el costo.
const COST_PCT_RE = /costo\s+(sube|baja)\s+(?:un\s+)?(\d+(?:[.,]\d+)?)\s*%/i;
// "lo vendo a 45000", "venta a 45000" → nuevo precio de venta absoluto.
const SALE_ABS_RE =
  /(?:lo\s+vendo|vender[ií]a|venta|precio)\s+(?:a|en)\s+(\d[\d.,]*\d|\d)/i;

interface ProjectionMod {
  unitPrice?: number;
  quantity?: number;
  commissionRate?: number;
}
interface MarginMod {
  cost?: number;
  sale?: number;
}

/**
 * Seguimientos que solo tienen sentido con memoria de la conversación (ADR-005):
 * "y si lo vendo 10% más caro", "y con 12% de comisión", "y si el costo sube a
 * 36.000". Toma el último cálculo recordado (proyección o margen) y lo rehace
 * con el cambio pedido, reusando el mismo cálculo y formato que la capacidad
 * original. Si no hay nada recordado o el cambio no se entiende, no matchea.
 */
@Injectable()
export class FollowUpCapability implements BotCapability {
  readonly name = 'follow-up';

  constructor(
    private readonly intentParser: IntentParserService,
    private readonly memory: ConversationMemoryService,
  ) {}

  canHandle(text: string, ctx: CapabilityContext): boolean {
    const mem = this.memory.get(ctx.conversationId);
    if (mem.lastIntent !== 'projection' && mem.lastIntent !== 'margin') return false;
    if (!FOLLOWUP_LEAD_RE.test(text) && !MODIFIER_HINT_RE.test(text)) return false;
    return this.resolve(text, mem) !== undefined;
  }

  async handle(text: string, ctx: CapabilityContext): Promise<string> {
    const mem = this.memory.get(ctx.conversationId);
    const resolved = this.resolve(text, mem);
    if (!resolved) {
      return 'No entendí el ajuste sobre lo anterior. Probá indicando el nuevo valor, ej. "y si lo vendo a 45.000".';
    }

    if (resolved.kind === 'projection') {
      const { quantity, unitPrice, commissionRate, product } = resolved;
      this.memory.update(ctx.conversationId, {
        lastIntent: 'projection',
        lastQuantity: quantity,
        lastUnitPrice: unitPrice,
        lastCommissionRate: commissionRate,
      });
      return formatProjectionReply(
        computeProjection(quantity, unitPrice, commissionRate, product),
      );
    }

    const { cost, sale } = resolved;
    this.memory.update(ctx.conversationId, {
      lastIntent: 'margin',
      lastMargin: { cost, sale },
    });
    return formatMarginReply(computeMargin(cost, sale));
  }

  /** Resuelve el seguimiento a valores concretos, o undefined si no aplica. */
  private resolve(
    text: string,
    mem: ConversationMemory,
  ):
    | { kind: 'projection'; quantity: number; unitPrice: number; commissionRate: number; product?: string }
    | { kind: 'margin'; cost: number; sale: number }
    | undefined {
    if (mem.lastIntent === 'projection') {
      if (
        mem.lastQuantity === undefined ||
        mem.lastUnitPrice === undefined ||
        mem.lastCommissionRate === undefined
      ) {
        return undefined;
      }
      const mod = this.parseProjectionMod(text, mem.lastUnitPrice, mem.lastQuantity);
      if (!mod) return undefined;
      return {
        kind: 'projection',
        quantity: mod.quantity ?? mem.lastQuantity,
        unitPrice: mod.unitPrice ?? mem.lastUnitPrice,
        commissionRate: mod.commissionRate ?? mem.lastCommissionRate,
        product: mem.lastProduct?.name,
      };
    }

    if (mem.lastIntent === 'margin' && mem.lastMargin) {
      const mod = this.parseMarginMod(text, mem.lastMargin);
      if (!mod) return undefined;
      return {
        kind: 'margin',
        cost: mod.cost ?? mem.lastMargin.cost,
        sale: mod.sale ?? mem.lastMargin.sale,
      };
    }

    return undefined;
  }

  private parseProjectionMod(
    text: string,
    lastUnitPrice: number,
    lastQuantity: number,
  ): ProjectionMod | undefined {
    const withoutPercent = text.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ');
    const mod: ProjectionMod = {};

    const pct = text.match(PCT_CHANGE_RE);
    if (pct) {
      const value = Number(pct[1].replace(',', '.')) / 100;
      const factor = /caro/i.test(pct[2]) ? 1 + value : 1 - value;
      mod.unitPrice = Math.round(lastUnitPrice * factor);
    } else {
      const abs = withoutPercent.match(UNIT_PRICE_ABS_RE);
      if (abs) mod.unitPrice = parseAmount(abs[1]);
    }

    // El "%" de "10% más caro" es un ajuste de precio, no una comisión: se saca
    // antes de buscar un cambio de tasa, para no confundir "10% más caro" con
    // "cambiá la comisión a 10%".
    const commissionText = pct ? text.replace(pct[0], ' ') : text;

    const qty = withoutPercent.match(QTY_RE);
    if (qty) {
      mod.quantity = Number(qty[1]);
    } else if (/\bel\s+doble\b/i.test(text)) {
      mod.quantity = lastQuantity * 2;
    } else if (/\bla\s+mitad\b/i.test(text)) {
      mod.quantity = Math.max(1, Math.round(lastQuantity / 2));
    }

    const { commissionRate } = this.intentParser.parseSalesQuery(commissionText);
    if (commissionRate !== undefined) mod.commissionRate = commissionRate;

    return mod.unitPrice !== undefined ||
      mod.quantity !== undefined ||
      mod.commissionRate !== undefined
      ? mod
      : undefined;
  }

  private parseMarginMod(
    text: string,
    last: { cost: number; sale: number },
  ): MarginMod | undefined {
    const mod: MarginMod = {};

    const costPct = text.match(COST_PCT_RE);
    if (costPct) {
      const value = Number(costPct[2].replace(',', '.')) / 100;
      mod.cost = Math.round(last.cost * (/sube/i.test(costPct[1]) ? 1 + value : 1 - value));
    } else {
      const costAbs = text.match(COST_ABS_RE);
      if (costAbs) mod.cost = parseAmount(costAbs[1]);
    }

    const saleAbs = text.match(SALE_ABS_RE);
    if (saleAbs) mod.sale = parseAmount(saleAbs[1]);
    const salePct = text.match(PCT_CHANGE_RE);
    if (!saleAbs && salePct) {
      const value = Number(salePct[1].replace(',', '.')) / 100;
      mod.sale = Math.round(last.sale * (/caro/i.test(salePct[2]) ? 1 + value : 1 - value));
    }

    return mod.cost !== undefined || mod.sale !== undefined ? mod : undefined;
  }
}
