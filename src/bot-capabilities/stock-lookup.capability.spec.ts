import { IntentParserService } from '../intent/intent-parser.service';
import { StockService } from '../stock/stock.service';
import { StockItem } from '../adapters/interfaces/inventory-adapter.interface';
import { StockLookupCapability } from './stock-lookup.capability';

describe('StockLookupCapability', () => {
  const items: StockItem[] = [
    { sku: 'PH-001', name: 'Galaxy A15', category: 'telefono', price: 21990, quantityAvailable: 12 },
    { sku: 'PH-003', name: 'Moto G34', category: 'telefono', price: 34990, quantityAvailable: 8 },
  ];

  function makeCapability(queryStock = jest.fn().mockResolvedValue(items)) {
    const capability = new StockLookupCapability(
      new IntentParserService(),
      { queryStock } as unknown as StockService,
    );
    return { capability, queryStock };
  }

  describe('canHandle', () => {
    it('matchea cuando hay un rango de precio', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('teléfonos entre 20.000 y 50.000')).toBe(true);
      expect(capability.canHandle('qué hay bajo 30000')).toBe(true);
    });

    it('no matchea sin rango de precio', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('cuánto gané este mes con 8% de comisión')).toBe(false);
      expect(capability.canHandle('hola qué tal')).toBe(false);
    });
  });

  describe('handle', () => {
    it('consulta StockService con el rango parseado y formatea la lista', async () => {
      const { capability, queryStock } = makeCapability();

      const reply = await capability.handle('teléfonos entre 20.000 y 50.000', 'seller-1');

      expect(queryStock).toHaveBeenCalledWith('default', { minPrice: 20000, maxPrice: 50000 });
      expect(reply).toContain('Galaxy A15');
      expect(reply).toContain('2 resultados');
    });
  });
});
