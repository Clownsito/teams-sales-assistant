export interface DateRange {
  from: Date;
  to: Date;
}

export interface SaleRecord {
  saleId: string;
  sellerId: string;
  amount: number;
  date: Date;
  productSku?: string;
}

/**
 * Igual que InventoryAdapter, pero para el historial de ventas por vendedor.
 * Si el ERP del cliente no expone un desglose limpio por vendedor, este es
 * el punto donde se resolvería (ver ADR-001, sección "a revisitar").
 */
export interface SalesAdapter {
  getSalesBySeller(sellerId: string, range: DateRange): Promise<SaleRecord[]>;
}
