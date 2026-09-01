import { IntentParserService } from '../intent/intent-parser.service';
import { StockService } from '../stock/stock.service';
import { StockItem } from '../adapters/interfaces/inventory-adapter.interface';
import { CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { StockLookupCapability } from './stock-lookup.capability';

const CTX: CapabilityContext = { sellerId: 'seller-1', conversationId: 'c1' };

describe('StockLookupCapability', () => {
  const items: StockItem[] = [
    { sku: 'PH-001', name: 'Galaxy A15', category: 'telefono', price: 21990, quantityAvailable: 12 },
    { sku: 'PH-003', name: 'Moto G34', category: 'telefono', price: 34990, quantityAvailable: 8 },
  ];

  function makeCapability(queryStock = jest.fn().mockResolvedValue(items)) {
    const memory = new ConversationMemoryService();
    const capability = new StockLookupCapability(
      new IntentParserService(),
      { queryStock } as unknown as StockService,
      memory,
    );
    return { capability, queryStock, memory };
  }

  describe('canHandle', () => {
    it('matchea cuando hay un rango de precio', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('teléfonos entre 20.000 y 50.000', CTX)).toBe(true);
      expect(capability.canHandle('qué hay bajo 30000', CTX)).toBe(true);
    });

    it('no matchea sin rango de precio', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('cuánto gané este mes con 8% de comisión', CTX)).toBe(false);
      expect(capability.canHandle('hola qué tal', CTX)).toBe(false);
    });
  });

  describe('handle', () => {
    it('consulta StockService con el rango parseado y formatea la lista', async () => {
      const { capability, queryStock } = makeCapability();

      const reply = await capability.handle('teléfonos entre 20.000 y 50.000', CTX);

      expect(queryStock).toHaveBeenCalledWith('default', { minPrice: 20000, maxPrice: 50000 });
      expect(reply).toContain('Galaxy A15');
      expect(reply).toContain('2 resultados');
    });

    it('recuerda el producto cuando la búsqueda deja un único resultado', async () => {
      const single: StockItem[] = [
        { sku: 'PH-004', name: 'iPhone SE', category: 'telefono', price: 49990, quantityAvailable: 3 },
      ];
      const { capability, memory } = makeCapability(jest.fn().mockResolvedValue(single));

      await capability.handle('iPhone SE entre 45.000 y 55.000', CTX);

      expect(memory.get('c1').lastProduct).toEqual({ name: 'iPhone SE', price: 49990 });
    });
  });
});
