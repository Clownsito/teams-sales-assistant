import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { MockSalesAdapter } from '../adapters/mock/mock-sales.adapter';

describe('SalesService', () => {
  function buildService(salespersonRepo: any) {
    return new SalesService(new MockSalesAdapter(), salespersonRepo);
  }

  it('usa la tasa de comisión indicada en la consulta, no una fija', async () => {
    const repo = { findOne: jest.fn() };
    const service = buildService(repo);

    const summary = await service.getMonthlySummary('seller-1', '2026-08', 0.08);

    // ventas de seller-1 en agosto (mock): 21990 + 34990 + 89990 = 146970
    expect(summary.grossSales).toBe(146970);
    expect(summary.commissionRateUsed).toBe(0.08);
    expect(summary.commissionAmount).toBeCloseTo(146970 * 0.08, 2);
    expect(summary.netMargin).toBeCloseTo(146970 * 0.92, 2);
    expect(repo.findOne).not.toHaveBeenCalled();
  });

  it('cae al default del vendedor si no se indica comisión en la pregunta', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue({ defaultCommissionRate: '0.05' }) };
    const service = buildService(repo);

    const summary = await service.getMonthlySummary('seller-1', '2026-08');

    expect(summary.commissionRateUsed).toBe(0.05);
  });

  it('rechaza la consulta si no hay tasa ni default', async () => {
    const repo = { findOne: jest.fn().mockResolvedValue(null) };
    const service = buildService(repo);

    await expect(service.getMonthlySummary('seller-1', '2026-08')).rejects.toThrow(BadRequestException);
  });
});
