export interface StockFilter {
  minPrice?: number;
  maxPrice?: number;
  category?: string;
}

export interface StockItem {
  sku: string;
  name: string;
  category: string;
  price: number;
  quantityAvailable: number;
  warehouse?: string;
}

/**
 * Cualquier ERP/CMS/controlador de inventario del cliente se integra
 * implementando esta interfaz. El resto del sistema (StockService, el bot,
 * el cache) nunca sabe qué ERP hay detrás — solo habla este contrato.
 */
export interface InventoryAdapter {
  getStock(filters: StockFilter): Promise<StockItem[]>;
}
