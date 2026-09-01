import { Module } from '@nestjs/common';
import { INVENTORY_ADAPTER, SALES_ADAPTER, STOCK_CACHE } from './tokens';
import { MockInventoryAdapter } from './mock/mock-inventory.adapter';
import { MockSalesAdapter } from './mock/mock-sales.adapter';
import { InMemoryCacheAdapter } from './cache/in-memory-cache.adapter';

/**
 * Punto único donde se decide qué implementación concreta usa cada tenant.
 * Hoy todos usan el mock; cuando exista un adaptador real (ej. para un ERP
 * específico), este es el único archivo que cambia — StockModule y
 * SalesModule no se enteran del cambio.
 */
@Module({
  providers: [
    { provide: INVENTORY_ADAPTER, useClass: MockInventoryAdapter },
    { provide: SALES_ADAPTER, useClass: MockSalesAdapter },
    { provide: STOCK_CACHE, useClass: InMemoryCacheAdapter },
  ],
  exports: [INVENTORY_ADAPTER, SALES_ADAPTER, STOCK_CACHE],
})
export class AdaptersModule {}
