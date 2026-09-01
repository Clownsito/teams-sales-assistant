import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ActivityHandler, MessageFactory, TurnContext } from 'botbuilder';
import { IntentParserService } from '../intent/intent-parser.service';
import { StockService } from '../stock/stock.service';
import { SalesService } from '../sales/sales.service';
import { BOT_TENANT_ID } from './teams.constants';
import {
  HELP_TEXT,
  WELCOME_TEXT,
  formatSalesReply,
  formatStockReply,
} from './message-formatter';

// Pistas de que el vendedor pregunta por sus ventas/comisión aunque no
// mencione un porcentaje. Si cae acá sin %, SalesService decide si usa el
// default del vendedor o pide el dato (ADR-002).
const SALES_HINT = /comisi[oó]n|gan[eé]|vend[ií]|mis ventas|mi margen|resumen/i;

/**
 * Capa de entrada del bot: traduce un mensaje de Teams a una llamada sobre
 * la lógica de negocio que YA existe (IntentParserService + StockService /
 * SalesService) y devuelve la respuesta formateada. No reimplementa nada de
 * parseo ni de cálculo — solo rutea.
 */
@Injectable()
export class TeamsBotService extends ActivityHandler {
  private readonly logger = new Logger('TeamsBot');

  constructor(
    private readonly intentParser: IntentParserService,
    private readonly stockService: StockService,
    private readonly salesService: SalesService,
  ) {
    super();

    this.onMessage(async (context, next) => {
      const text = (TurnContext.removeRecipientMention(context.activity) ?? '').trim();
      const sellerId = context.activity.from?.id ?? 'unknown';
      this.logger.log(`Mensaje de ${sellerId}: "${text}"`);

      const reply = await this.buildReply(text, sellerId);
      await context.sendActivity(MessageFactory.text(reply));
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const botId = context.activity.recipient?.id;
      for (const member of context.activity.membersAdded ?? []) {
        if (member.id !== botId) {
          await context.sendActivity(MessageFactory.text(WELCOME_TEXT));
        }
      }
      await next();
    });
  }

  /**
   * Decide la intención y llama al servicio correspondiente. Público para
   * poder testear el ruteo sin levantar el SDK del bot.
   */
  async buildReply(text: string, sellerId: string): Promise<string> {
    if (!text) return HELP_TEXT;

    // 1) ¿Consulta de stock? Se detecta por un rango de precio en el texto.
    const stockQuery = this.intentParser.parseStockQuery(text);
    const hasPriceRange =
      stockQuery.minPrice !== undefined || stockQuery.maxPrice !== undefined;

    if (hasPriceRange) {
      const items = await this.stockService.queryStock(BOT_TENANT_ID, stockQuery);
      return formatStockReply(items, stockQuery);
    }

    // 2) ¿Consulta de comisión/ventas? Se detecta por un % o por palabras clave.
    const salesQuery = this.intentParser.parseSalesQuery(text);
    if (salesQuery.commissionRate !== undefined || SALES_HINT.test(text)) {
      try {
        const summary = await this.salesService.getMonthlySummary(
          sellerId,
          currentMonth(),
          salesQuery.commissionRate,
        );
        return formatSalesReply(summary);
      } catch (error) {
        // SalesService lanza BadRequestException con un mensaje pensado para
        // el vendedor (ej. "no indicaste tu % de comisión..."). Se reenvía tal cual.
        if (error instanceof BadRequestException) {
          return String(error.message);
        }
        throw error;
      }
    }

    // 3) No se reconoció la intención.
    return HELP_TEXT;
  }
}

/** Mes actual en formato "YYYY-MM", igual que SalesController. */
function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
