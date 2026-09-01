import { Injectable } from '@nestjs/common';
import { IntentParserService } from '../intent/intent-parser.service';
import { StockService } from '../stock/stock.service';
import { BOT_TENANT_ID } from '../teams/teams.constants';
import { formatStockReply } from '../teams/message-formatter';
import { BotCapability } from './bot-capability.interface';

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
  ) {}

  canHandle(text: string): boolean {
    const query = this.intentParser.parseStockQuery(text);
    return query.minPrice !== undefined || query.maxPrice !== undefined;
  }

  async handle(text: string, _sellerId: string): Promise<string> {
    const query = this.intentParser.parseStockQuery(text);
    const items = await this.stockService.queryStock(BOT_TENANT_ID, query);
    return formatStockReply(items, query);
  }
}
