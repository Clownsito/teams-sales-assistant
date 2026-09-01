import { Inject, Injectable } from '@nestjs/common';
import { INVENTORY_ADAPTER, STOCK_CACHE } from '../adapters/tokens';
import { InventoryAdapter, StockFilter, StockItem } from '../adapters/interfaces/inventory-adapter.interface';
import { StockCache } from '../adapters/cache/stock-cache.interface';

const CACHE_TTL_SECONDS = Number(process.env.CACHE_TTL_SECONDS ?? 300);

@Injectable()
export class StockService {
  constructor(
    @Inject(INVENTORY_ADAPTER) private readonly inventoryAdapter: InventoryAdapter,
    @Inject(STOCK_CACHE) private readonly cache: StockCache,
  ) {}

  async queryStock(tenantId: string, filters: StockFilter): Promise<StockItem[]> {
    const cacheKey = this.buildCacheKey(tenantId, filters);

    const cached = await this.cache.get<StockItem[]>(cacheKey);
    if (cached) return cached;

    // El ERP se actualiza a diario (ver ADR-001), así que un cache de unos
    // minutos es seguro y evita golpearlo en cada pregunta del vendedor.
    const stock = await this.inventoryAdapter.getStock(filters);
    await this.cache.set(cacheKey, stock, CACHE_TTL_SECONDS);
    return stock;
  }

  private buildCacheKey(tenantId: string, filters: StockFilter): string {
    return `stock:${tenantId}:${filters.minPrice ?? ''}:${filters.maxPrice ?? ''}:${filters.category ?? ''}`;
  }
}
