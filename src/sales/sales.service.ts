import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SALES_ADAPTER } from '../adapters/tokens';
import { SalesAdapter } from '../adapters/interfaces/sales-adapter.interface';
import { Salesperson } from '../tenants/entities/salesperson.entity';

export interface CommissionSummary {
  sellerId: string;
  month: string;
  grossSales: number;
  commissionRateUsed: number;
  commissionAmount: number;
  netMargin: number;
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(SALES_ADAPTER) private readonly salesAdapter: SalesAdapter,
    @InjectRepository(Salesperson) private readonly salespeople: Repository<Salesperson>,
  ) {}

  async getMonthlySummary(
    sellerId: string,
    month: string,
    requestedCommissionRate?: number,
  ): Promise<CommissionSummary> {
    const commissionRate = await this.resolveCommissionRate(sellerId, requestedCommissionRate);

    const { from, to } = this.monthRange(month);
    const sales = await this.salesAdapter.getSalesBySeller(sellerId, { from, to });

    const grossSales = sales.reduce((total, sale) => total + sale.amount, 0);
    const commissionAmount = this.round(grossSales * commissionRate);
    const netMargin = this.round(grossSales - commissionAmount);

    return {
      sellerId,
      month,
      grossSales: this.round(grossSales),
      commissionRateUsed: commissionRate,
      commissionAmount,
      netMargin,
    };
  }

  /**
   * ADR-002: la tasa viene primero de la propia pregunta del vendedor;
   * si no la indicó, se cae al default guardado en su perfil; si tampoco
   * existe, se pide explícitamente en vez de asumir un valor fijo.
   */
  private async resolveCommissionRate(sellerId: string, requested?: number): Promise<number> {
    if (requested !== undefined) return requested;

    const salesperson = await this.salespeople.findOne({ where: { teamsUserId: sellerId } });
    if (salesperson?.defaultCommissionRate !== undefined && salesperson?.defaultCommissionRate !== null) {
      return Number(salesperson.defaultCommissionRate);
    }

    throw new BadRequestException(
      'No indicaste tu % de comisión y no tienes uno guardado por defecto. Pregunta incluyendo el porcentaje, ej. "con 8% de comisión".',
    );
  }

  private monthRange(month: string): { from: Date; to: Date } {
    const [year, monthIndex] = month.split('-').map(Number);
    const from = new Date(year, monthIndex - 1, 1);
    const to = new Date(year, monthIndex, 0, 23, 59, 59);
    return { from, to };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
