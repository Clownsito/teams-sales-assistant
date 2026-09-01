import { Controller, Get, Param, Query } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SalesQueryDto } from './dto/sales-query.dto';

@Controller('sales')
export class SalesController {
  constructor(private readonly salesService: SalesService) {}

  @Get(':sellerId/summary')
  async getSummary(@Param('sellerId') sellerId: string, @Query() query: SalesQueryDto) {
    const month = query.month ?? this.currentMonth();
    return this.salesService.getMonthlySummary(sellerId, month, query.commissionRate);
  }

  private currentMonth(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }
}
