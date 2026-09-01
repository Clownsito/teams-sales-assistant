import { Injectable } from '@nestjs/common';
import { InventoryAdapter, StockFilter, StockItem } from '../interfaces/inventory-adapter.interface';

/**
 * Adaptador de prueba con datos en memoria — sirve para desarrollar y
 * demostrar el flujo completo (bot -> stock -> respuesta) sin depender
 * de un ERP real todavía. Un ERP real solo necesita implementar la misma
 * interfaz InventoryAdapter.
 */
@Injectable()
export class MockInventoryAdapter implements InventoryAdapter {
  private readonly catalog: StockItem[] = [
    { sku: 'PH-001', name: 'Galaxy A15', category: 'telefono', price: 21990, quantityAvailable: 12, warehouse: 'Bodega Central' },
    { sku: 'PH-002', name: 'Redmi Note 13', category: 'telefono', price: 27990, quantityAvailable: 5, warehouse: 'Bodega Central' },
    { sku: 'PH-003', name: 'Moto G34', category: 'telefono', price: 34990, quantityAvailable: 8, warehouse: 'Bodega Norte' },
    { sku: 'PH-004', name: 'iPhone SE', category: 'telefono', price: 49990, quantityAvailable: 3, warehouse: 'Bodega Central' },
    { sku: 'PH-005', name: 'Galaxy S23', category: 'telefono', price: 89990, quantityAvailable: 2, warehouse: 'Bodega Norte' },
    { sku: 'PH-006', name: 'iPhone 15', category: 'telefono', price: 119990, quantityAvailable: 4, warehouse: 'Bodega Central' },
  ];

  async getStock(filters: StockFilter): Promise<StockItem[]> {
    return this.catalog.filter((item) => {
      if (filters.category && item.category !== filters.category) return false;
      if (filters.minPrice !== undefined && item.price < filters.minPrice) return false;
      if (filters.maxPrice !== undefined && item.price > filters.maxPrice) return false;
      return true;
    });
  }
}
