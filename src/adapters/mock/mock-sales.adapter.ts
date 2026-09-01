import { Injectable } from '@nestjs/common';
import { DateRange, SaleRecord, SalesAdapter } from '../interfaces/sales-adapter.interface';

/**
 * Igual que MockInventoryAdapter, pero para el historial de ventas.
 * Genera ventas de ejemplo para poder probar el cálculo de comisión/margen
 * sin depender de datos reales del ERP.
 */
@Injectable()
export class MockSalesAdapter implements SalesAdapter {
  private readonly sales: SaleRecord[] = [
    { saleId: 'S-1001', sellerId: 'seller-1', amount: 21990, date: new Date('2026-08-03'), productSku: 'PH-001' },
    { saleId: 'S-1002', sellerId: 'seller-1', amount: 34990, date: new Date('2026-08-11'), productSku: 'PH-003' },
    { saleId: 'S-1003', sellerId: 'seller-1', amount: 89990, date: new Date('2026-08-20'), productSku: 'PH-005' },
    { saleId: 'S-1004', sellerId: 'seller-2', amount: 119990, date: new Date('2026-08-05'), productSku: 'PH-006' },
  ];

  async getSalesBySeller(sellerId: string, range: DateRange): Promise<SaleRecord[]> {
    return this.sales.filter(
      (sale) => sale.sellerId === sellerId && sale.date >= range.from && sale.date <= range.to,
    );
  }
}
