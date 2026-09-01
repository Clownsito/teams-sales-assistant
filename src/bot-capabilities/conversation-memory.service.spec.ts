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
    memory.appendTurn('c1', 'hola', 'buenas');

    memory.clear('c1');

    expect(memory.get('c1')).toEqual({});
    expect(memory.getTranscript('c1')).toEqual([]);
  });

  describe('historial de mensajes', () => {
    it('acumula los intercambios como pares usuario/bot', () => {
      const memory = new ConversationMemoryService();

      memory.appendTurn('c1', '¿qué hay bajo 30000?', 'Galaxy A15 y Redmi Note 13.');
      memory.appendTurn('c1', '¿y el más caro de esos?', 'El Redmi Note 13 a $27.990.');

      expect(memory.getTranscript('c1')).toEqual([
        { role: 'user', text: '¿qué hay bajo 30000?' },
        { role: 'bot', text: 'Galaxy A15 y Redmi Note 13.' },
        { role: 'user', text: '¿y el más caro de esos?' },
        { role: 'bot', text: 'El Redmi Note 13 a $27.990.' },
      ]);
    });

    it('mantiene solo los últimos 20 turnos (10 intercambios)', () => {
      const memory = new ConversationMemoryService();
      for (let i = 0; i < 15; i++) memory.appendTurn('c1', `p${i}`, `r${i}`);

      const transcript = memory.getTranscript('c1');
      expect(transcript).toHaveLength(20);
      expect(transcript[0]).toEqual({ role: 'user', text: 'p5' });
      expect(transcript[19]).toEqual({ role: 'bot', text: 'r14' });
    });

    it('recorta los mensajes largos al guardarlos', () => {
      const memory = new ConversationMemoryService();
      memory.appendTurn('c1', 'x'.repeat(2000), 'ok');

      expect(memory.getTranscript('c1')[0].text).toHaveLength(601); // 600 + "…"
    });

    it('convive con el resumen del último cálculo sin pisarlo', () => {
      const memory = new ConversationMemoryService();
      memory.update('c1', { lastIntent: 'margin', lastMargin: { cost: 34000, sale: 40000 } });
      memory.appendTurn('c1', 'y si sube el costo', 'nuevo margen...');

      expect(memory.get('c1').lastMargin).toEqual({ cost: 34000, sale: 40000 });
      expect(memory.getTranscript('c1')).toHaveLength(2);
    });
  });
});
