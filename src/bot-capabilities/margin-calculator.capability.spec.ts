import { MarginCalculatorCapability } from './margin-calculator.capability';

describe('MarginCalculatorCapability', () => {
  const capability = new MarginCalculatorCapability();

  describe('canHandle', () => {
    it('matchea cuando aparecen precio de costo y de venta', () => {
      expect(capability.canHandle('cuesta 34000 lo vendo en 40000 qué margen me da')).toBe(true);
      expect(capability.canHandle('compra a 34000 venta a 40000')).toBe(true);
      expect(capability.canHandle('costo 34.000 precio 85.000')).toBe(true);
    });

    it('no matchea si falta alguno de los dos precios o si no hay montos claros', () => {
      expect(capability.canHandle('lo vendo en 40000')).toBe(false); // solo venta
      expect(capability.canHandle('me cuesta 34000')).toBe(false); // solo costo
      expect(capability.canHandle('cuánto gané este mes con 8% de comisión')).toBe(false);
      expect(capability.canHandle('teléfonos entre 20000 y 50000')).toBe(false);
      expect(capability.canHandle('hola qué tal')).toBe(false);
    });
  });

  describe('handle', () => {
    it('calcula ganancia, margen sobre venta y markup sobre costo', async () => {
      const reply = await capability.handle(
        'cuesta 34000 lo vendo en 40000 qué margen me da',
        'seller-1',
      );

      expect(reply).toContain('Ganancia: $6.000');
      expect(reply).toContain('Margen sobre venta: 15,00%');
      expect(reply).toContain('Markup sobre costo: 17,65%'); // 6000/34000 = 17,647%
    });

    it('reconoce el formato "costo X precio Y" con separador de miles', async () => {
      const reply = await capability.handle('costo 34.000 precio 85.000', 'seller-1');

      expect(reply).toContain('Ganancia: $51.000');
      expect(reply).toContain('Margen sobre venta: 60,00%');
      expect(reply).toContain('Markup sobre costo: 150,00%');
    });

    it('avisa cuando la venta está por debajo del costo', async () => {
      const reply = await capability.handle('me cuesta 40000 y lo vendo en 34000', 'seller-1');

      expect(reply).toContain('Ganancia: -$6.000');
      expect(reply).toContain('por debajo del costo');
    });
  });
});
