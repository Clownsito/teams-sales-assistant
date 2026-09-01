import { IntentParserService } from '../intent/intent-parser.service';
import { StockService } from '../stock/stock.service';
import { StockItem } from '../adapters/interfaces/inventory-adapter.interface';
import { SaleProjectionCapability } from './sale-projection.capability';

describe('SaleProjectionCapability', () => {
  const catalog: StockItem[] = [
    { sku: 'PH-001', name: 'Galaxy A15', category: 'telefono', price: 21990, quantityAvailable: 12 },
    { sku: 'PH-004', name: 'iPhone SE', category: 'telefono', price: 49990, quantityAvailable: 3 },
  ];

  function makeCapability(queryStock = jest.fn().mockResolvedValue(catalog)) {
    const capability = new SaleProjectionCapability(
      new IntentParserService(),
      { queryStock } as unknown as StockService,
    );
    return { capability, queryStock };
  }

  describe('canHandle', () => {
    it('matchea una proyección hipotética explícita', () => {
      const { capability } = makeCapability();
      expect(
        capability.canHandle('cuánto ganaría si vendo 50 teléfonos a 30000 con 8% de comisión'),
      ).toBe(true);
      expect(capability.canHandle('si vendo 10 iPhone SE con 8% de comisión')).toBe(true);
    });

    it('no matchea el resumen mensual real ni frases sin "si vendo / proyección"', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('cuánto gané este mes con 8% de comisión')).toBe(false);
      expect(capability.canHandle('cuesta 34000 lo vendo en 40000')).toBe(false);
      expect(capability.canHandle('hola qué tal')).toBe(false);
    });
  });

  describe('handle', () => {
    it('con cantidad, precio unitario y % calcula ingreso total y comisión del vendedor', async () => {
      const { capability } = makeCapability();

      const reply = await capability.handle(
        'cuánto ganaría si vendo 50 teléfonos a 30000 con 8% de comisión',
        'seller-1',
      );

      // 50 * 30000 = 1.500.000 ; 8% = 120.000
      expect(reply).toContain('$1.500.000');
      expect(reply).toContain('$120.000');
    });

    it('si falta el precio pero se nombra un producto del stock, usa ese precio', async () => {
      const { capability, queryStock } = makeCapability();

      const reply = await capability.handle(
        'si vendo 10 iPhone SE con 8% de comisión',
        'seller-1',
      );

      expect(queryStock).toHaveBeenCalled();
      // 10 * 49990 = 499.900 ; 8% = 39.992
      expect(reply).toContain('$39.992');
      expect(reply).toContain('tomado del stock');
    });

    it('pide la cantidad cuando no aparece', async () => {
      const { capability } = makeCapability();
      const reply = await capability.handle('si vendo a 30000 con 8% de comisión', 'seller-1');
      expect(reply).toContain('¿Cuántas unidades');
    });

    it('pide el % de comisión cuando no aparece', async () => {
      const { capability } = makeCapability();
      const reply = await capability.handle('si vendo 50 a 30000', 'seller-1');
      expect(reply).toContain('¿Con qué % de comisión?');
    });

    it('pide el precio cuando no hay precio ni un producto reconocible del stock', async () => {
      const { capability } = makeCapability();
      const reply = await capability.handle('si vendo 50 con 8% de comisión', 'seller-1');
      expect(reply).toContain('precio por unidad');
    });
  });
});
