import { CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { MarginCalculatorCapability } from './margin-calculator.capability';

const CTX: CapabilityContext = { sellerId: 'seller-1', conversationId: 'c1' };

describe('MarginCalculatorCapability', () => {
  function makeCapability() {
    const memory = new ConversationMemoryService();
    return { capability: new MarginCalculatorCapability(memory), memory };
  }

  describe('canHandle', () => {
    it('matchea cuando aparecen precio de costo y de venta', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('cuesta 34000 lo vendo en 40000 qué margen me da', CTX)).toBe(true);
      expect(capability.canHandle('compra a 34000 venta a 40000', CTX)).toBe(true);
      expect(capability.canHandle('costo 34.000 precio 85.000', CTX)).toBe(true);
    });

    it('no matchea si falta alguno de los dos precios o si no hay montos claros', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('lo vendo en 40000', CTX)).toBe(false); // solo venta
      expect(capability.canHandle('me cuesta 34000', CTX)).toBe(false); // solo costo
      expect(capability.canHandle('cuánto gané este mes con 8% de comisión', CTX)).toBe(false);
      expect(capability.canHandle('teléfonos entre 20000 y 50000', CTX)).toBe(false);
      expect(capability.canHandle('hola qué tal', CTX)).toBe(false);
    });
  });

  describe('handle', () => {
    it('calcula ganancia, margen sobre venta y markup sobre costo', async () => {
      const { capability } = makeCapability();
      const reply = await capability.handle(
        'cuesta 34000 lo vendo en 40000 qué margen me da',
        CTX,
      );

      expect(reply).toContain('Ganancia: $6.000');
      expect(reply).toContain('Margen sobre venta: 15,00%');
      expect(reply).toContain('Markup sobre costo: 17,65%'); // 6000/34000 = 17,647%
    });

    it('reconoce el formato "costo X precio Y" con separador de miles', async () => {
      const { capability } = makeCapability();
      const reply = await capability.handle('costo 34.000 precio 85.000', CTX);

      expect(reply).toContain('Ganancia: $51.000');
      expect(reply).toContain('Margen sobre venta: 60,00%');
      expect(reply).toContain('Markup sobre costo: 150,00%');
    });

    it('avisa cuando la venta está por debajo del costo', async () => {
      const { capability } = makeCapability();
      const reply = await capability.handle('me cuesta 40000 y lo vendo en 34000', CTX);

      expect(reply).toContain('Ganancia: -$6.000');
      expect(reply).toContain('por debajo del costo');
    });

    it('recuerda costo y venta para un seguimiento posterior', async () => {
      const { capability, memory } = makeCapability();
      await capability.handle('cuesta 34000 lo vendo en 40000', CTX);

      expect(memory.get('c1')).toMatchObject({
        lastIntent: 'margin',
        lastMargin: { cost: 34000, sale: 40000 },
      });
    });
  });
});
