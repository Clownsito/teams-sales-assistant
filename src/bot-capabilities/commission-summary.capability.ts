import { BadRequestException, Injectable } from '@nestjs/common';
import { IntentParserService } from '../intent/intent-parser.service';
import { SalesService } from '../sales/sales.service';
import { formatSalesReply } from '../teams/message-formatter';
import { BotCapability, CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { currentMonth } from './current-month.util';

// Pistas de que el vendedor pregunta por SUS ventas/comisión del mes aunque
// no mencione un porcentaje. Si cae acá sin %, SalesService decide si usa el
// default del vendedor o pide el dato (ADR-002).
const SALES_HINT = /comisi[oó]n|gan[eé]|vend[ií]|mis ventas|mi margen|resumen/i;

/**
 * "¿Cuánto gané este mes con 8% de comisión?" — resumen mensual real del
 * vendedor. Reutiliza IntentParserService.parseSalesQuery para el % y
 * SalesService.getMonthlySummary para el cálculo (ADR-002: la tasa nunca es fija).
 */
@Injectable()
export class CommissionSummaryCapability implements BotCapability {
  readonly name = 'commission-summary';

  constructor(
    private readonly intentParser: IntentParserService,
    private readonly salesService: SalesService,
    private readonly memory: ConversationMemoryService,
  ) {}

  canHandle(text: string, _ctx: CapabilityContext): boolean {
    const { commissionRate } = this.intentParser.parseSalesQuery(text);
    return commissionRate !== undefined || SALES_HINT.test(text);
  }

  async handle(text: string, ctx: CapabilityContext): Promise<string> {
    const { commissionRate } = this.intentParser.parseSalesQuery(text);
    try {
      const summary = await this.salesService.getMonthlySummary(
        ctx.sellerId,
        currentMonth(),
        commissionRate,
      );
      this.memory.update(ctx.conversationId, {
        lastIntent: 'commission',
        lastCommissionRate: summary.commissionRateUsed,
      });
      return formatSalesReply(summary);
    } catch (error) {
      // SalesService lanza BadRequestException con un mensaje pensado para el
      // vendedor (ej. "no indicaste tu % de comisión..."). Se reenvía tal cual.
      if (error instanceof BadRequestException) {
        return String(error.message);
      }
      throw error;
    }
  }
}
