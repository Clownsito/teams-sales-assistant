import { IntentParserService } from '../intent/intent-parser.service';
import { CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { FollowUpCapability } from './follow-up.capability';

const CTX: CapabilityContext = { sellerId: 'seller-1', conversationId: 'c1' };

describe('FollowUpCapability', () => {
  function make() {
    const memory = new ConversationMemoryService();
    const capability = new FollowUpCapability(new IntentParserService(), memory);
    return { capability, memory };
  }

  function seedProjection(memory: ConversationMemoryService) {
    memory.update('c1', {
      lastIntent: 'projection',
      lastQuantity: 10,
      lastUnitPrice: 49990,
      lastCommissionRate: 0.08,
      lastProduct: { name: 'iPhone SE', price: 49990 },
    });
  }

  describe('canHandle', () => {
    it('no matchea si no hay nada recordado', () => {
      const { capability } = make();
      expect(capability.canHandle('y si lo vendo 10% más caro', CTX)).toBe(false);
    });

    it('no matchea si el texto no parece un seguimiento', () => {
      const { capability, memory } = make();
      seedProjection(memory);
      expect(capability.canHandle('hola qué tal', CTX)).toBe(false);
    });

    it('matchea un ajuste sobre la última proyección', () => {
      const { capability, memory } = make();
      seedProjection(memory);
      expect(capability.canHandle('y si lo vendo 10% más caro', CTX)).toBe(true);
    });
  });

  describe('handle — proyección', () => {
    it('"10% más caro" recalcula con el precio unitario ajustado', async () => {
      const { capability, memory } = make();
      seedProjection(memory);

      const reply = await capability.handle('y si lo vendo 10% más caro', CTX);

      // 49990 * 1.10 = 54989 ; 10 * 54989 = 549.890 ; 8% = 43.991,2
      expect(reply).toContain('$549.890');
      expect(reply).toContain('43.991,2');
      // y deja el nuevo precio recordado para encadenar otro seguimiento
      expect(memory.get('c1').lastUnitPrice).toBe(54989);
    });

    it('"y con 12% de comisión" recalcula solo la tasa', async () => {
      const { capability, memory } = make();
      seedProjection(memory);

      const reply = await capability.handle('y con 12% de comisión', CTX);

      // 10 * 49990 = 499.900 ; 12% = 59.988
      expect(reply).toContain('$59.988');
      expect(memory.get('c1').lastCommissionRate).toBe(0.12);
    });

    it('"y si son 20 unidades" recalcula solo la cantidad', async () => {
      const { capability, memory } = make();
      seedProjection(memory);

      const reply = await capability.handle('y si son 20 unidades', CTX);

      // 20 * 49990 = 999.800 ; 8% = 79.984
      expect(reply).toContain('$79.984');
    });
  });

  describe('handle — margen', () => {
    function seedMargin(memory: ConversationMemoryService) {
      memory.update('c1', { lastIntent: 'margin', lastMargin: { cost: 34000, sale: 40000 } });
    }

    it('"y si el costo sube a 36.000" rehace el margen con el nuevo costo', async () => {
      const { capability, memory } = make();
      seedMargin(memory);

      const reply = await capability.handle('y si el costo sube a 36.000', CTX);

      // 40000 - 36000 = 4000 ; 4000/40000 = 10,00%
      expect(reply).toContain('Ganancia: $4.000');
      expect(reply).toContain('Margen sobre venta: 10,00%');
      expect(memory.get('c1').lastMargin).toEqual({ cost: 36000, sale: 40000 });
    });

    it('"y si lo vendo 5% más caro" sube el precio de venta', async () => {
      const { capability, memory } = make();
      seedMargin(memory);

      const reply = await capability.handle('y si lo vendo 5% más caro', CTX);

      // 40000 * 1.05 = 42000 ; 42000 - 34000 = 8000
      expect(reply).toContain('Ganancia: $8.000');
    });
  });
});
