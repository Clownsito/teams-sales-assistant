import { ConversationMemoryService } from './conversation-memory.service';

describe('ConversationMemoryService', () => {
  it('devuelve un objeto vacío para una conversación desconocida', () => {
    const memory = new ConversationMemoryService();
    expect(memory.get('nueva')).toEqual({});
  });

  it('mezcla los patches sucesivos en vez de reemplazar', () => {
    const memory = new ConversationMemoryService();

    memory.update('c1', { lastIntent: 'projection', lastQuantity: 10 });
    memory.update('c1', { lastUnitPrice: 49990 });

    expect(memory.get('c1')).toEqual({
      lastIntent: 'projection',
      lastQuantity: 10,
      lastUnitPrice: 49990,
    });
  });

  it('aísla la memoria por conversationId', () => {
    const memory = new ConversationMemoryService();

    memory.update('c1', { lastIntent: 'margin' });
    memory.update('c2', { lastIntent: 'stock' });

    expect(memory.get('c1').lastIntent).toBe('margin');
    expect(memory.get('c2').lastIntent).toBe('stock');
  });

  it('olvida la conversación al llamar clear', () => {
    const memory = new ConversationMemoryService();
    memory.update('c1', { lastIntent: 'projection' });

    memory.clear('c1');

    expect(memory.get('c1')).toEqual({});
  });
});
