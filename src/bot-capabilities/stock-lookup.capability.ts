import { Injectable } from '@nestjs/common';
import { IntentParserService } from '../intent/intent-parser.service';
import { StockService } from '../stock/stock.service';
import { BOT_TENANT_ID } from '../teams/teams.constants';
import { formatStockReply } from '../teams/message-formatter';
import { BotCapability, CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';

/**
 * "¿Qué stock hay entre 20.000 y 50.000?" — consulta de inventario por rango
 * de precio. Reutiliza IntentParserService.parseStockQuery para detectar el
 * rango y StockService.queryStock para traer los datos (con su cache).
 */
@Injectable()
export class StockLookupCapability implements BotCapability {
  readonly name = 'stock-lookup';

  constructor(
    private readonly intentParser: IntentParserService,
    private readonly stockService: StockService,
    private readonly memory: ConversationMemoryService,
  ) {}

  canHandle(text: string, _ctx: CapabilityContext): boolean {
    const query = this.intentParser.parseStockQuery(text);
    return query.minPrice !== undefined || query.maxPrice !== undefined;
  }

  async handle(text: string, ctx: CapabilityContext): Promise<string> {
    const query = this.intentParser.parseStockQuery(text);
    const items = await this.stockService.queryStock(BOT_TENANT_ID, query);

    // Si la búsqueda dejó un único producto, se recuerda para seguimientos
    // tipo "y si lo vendo 10% más caro" (ver ADR-005 / FollowUpCapability).
    if (items.length === 1) {
      this.memory.update(ctx.conversationId, {
        lastIntent: 'stock',
        lastProduct: { name: items[0].name, price: items[0].price },
        lastUnitPrice: items[0].price,
      });
    } else {
      this.memory.update(ctx.conversationId, { lastIntent: 'stock' });
    }

    return formatStockReply(items, query);
  }
}
