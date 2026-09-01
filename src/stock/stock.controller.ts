import { Controller, Get, Query } from '@nestjs/common';
import { StockService } from './stock.service';
import { StockQueryDto } from './dto/stock-query.dto';

@Controller('stock')
export class StockController {
  constructor(private readonly stockService: StockService) {}

  @Get()
  async getStock(@Query() query: StockQueryDto) {
    const tenantId = query.tenantId ?? 'default';
    const items = await this.stockService.queryStock(tenantId, {
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      category: query.category,
    });

    return {
      count: items.length,
      items,
    };
  }
}
