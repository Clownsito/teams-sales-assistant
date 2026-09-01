import { StockService } from './stock.service';
import { MockInventoryAdapter } from '../adapters/mock/mock-inventory.adapter';
import { InMemoryCacheAdapter } from '../adapters/cache/in-memory-cache.adapter';

describe('StockService', () => {
  it('filtra el catálogo por rango de precio', async () => {
    const service = new StockService(new MockInventoryAdapter(), new InMemoryCacheAdapter());

    const result = await service.queryStock('tenant-1', { minPrice: 20000, maxPrice: 50000 });

    expect(result.every((item) => item.price >= 20000 && item.price <= 50000)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it('devuelve el resultado cacheado en la segunda consulta idéntica', async () => {
    const adapter = new MockInventoryAdapter();
    const spy = jest.spyOn(adapter, 'getStock');
    const service = new StockService(adapter, new InMemoryCacheAdapter());

    await service.queryStock('tenant-1', { maxPrice: 30000 });
    await service.queryStock('tenant-1', { maxPrice: 30000 });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});
