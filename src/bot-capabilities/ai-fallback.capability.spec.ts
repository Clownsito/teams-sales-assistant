import { ConfigService } from '@nestjs/config';
import { StockService } from '../stock/stock.service';
import { SalesService } from '../sales/sales.service';
import { HELP_TEXT } from '../teams/message-formatter';
import { CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { AiFallbackCapability } from './ai-fallback.capability';

const CTX: CapabilityContext = { sellerId: 'seller-1', conversationId: 'c1' };

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

function makeCapability(
  values: Record<string, string | undefined>,
  stock: Partial<StockService> = {},
  sales: Partial<SalesService> = {},
) {
  const queryStock = (stock.queryStock as jest.Mock) ?? jest.fn().mockResolvedValue([]);
  const getMonthlySummary =
    (sales.getMonthlySummary as jest.Mock) ?? jest.fn().mockResolvedValue({});
  const memory = new ConversationMemoryService();
  const cap = new AiFallbackCapability(
    memory,
    fakeConfig(values),
    { queryStock } as unknown as StockService,
    { getMonthlySummary } as unknown as SalesService,
  );
  return { cap, queryStock, getMonthlySummary, memory };
}

describe('AiFallbackCapability', () => {
  it('sin ANTHROPIC_API_KEY, canHandle es false y el router cae a la ayuda', () => {
    const { cap } = makeCapability({});
    expect(cap.canHandle('cualquier pregunta rara', CTX)).toBe(false);
  });

  it('con IA disponible y respuesta directa, devuelve el texto del modelo', async () => {
    const { cap } = makeCapability({ ANTHROPIC_API_KEY: 'sk-test' });
    const create = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'El iPhone SE es la opción más equilibrada.' }],
    });
    (cap as unknown as { client: unknown }).client = { messages: { create } };

    const reply = await cap.handle('¿iPhone SE o Galaxy A15?', CTX);

    expect(reply).toContain('iPhone SE');
  });

  it('cuando el modelo pide consultar_stock, ejecuta la tool y responde con el resultado', async () => {
    const items = [
      { sku: 'PH-001', name: 'Galaxy A15', category: 'telefono', price: 21990, quantityAvailable: 12 },
    ];
    const { cap, queryStock } = makeCapability(
      { ANTHROPIC_API_KEY: 'sk-test' },
      { queryStock: jest.fn().mockResolvedValue(items) },
    );
    const create = jest
      .fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [{ type: 'tool_use', id: 't1', name: 'consultar_stock', input: {} }],
      })
      .mockResolvedValueOnce({
        stop_reason: 'end_turn',
        content: [{ type: 'text', text: 'Hay 1 producto disponible: Galaxy A15.' }],
      });
    (cap as unknown as { client: unknown }).client = { messages: { create } };

    const reply = await cap.handle('dame todo el inventario disponible', CTX);

    expect(queryStock).toHaveBeenCalledWith('default', {
      minPrice: undefined,
      maxPrice: undefined,
      category: undefined,
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(reply).toContain('Galaxy A15');
  });

  it('incluye el historial reciente del hilo como mensajes previos en la llamada', async () => {
    const { cap, memory } = makeCapability({ ANTHROPIC_API_KEY: 'sk-test' });
    memory.appendTurn('c1', '¿qué teléfonos hay bajo 30000?', 'Galaxy A15 y Redmi Note 13.');
    memory.appendTurn('c1', '¿y el más barato?', 'El Galaxy A15 a $21.990.');

    const create = jest.fn().mockResolvedValue({
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'Sí, quedan 12 unidades.' }],
    });
    (cap as unknown as { client: unknown }).client = { messages: { create } };

    await cap.handle('¿tenés stock de ese?', CTX);

    const sentMessages = create.mock.calls[0][0].messages;
    expect(sentMessages).toHaveLength(5); // 2 intercambios previos (4) + la pregunta actual
    expect(sentMessages[0]).toEqual({ role: 'user', content: '¿qué teléfonos hay bajo 30000?' });
    expect(sentMessages[1]).toEqual({ role: 'assistant', content: 'Galaxy A15 y Redmi Note 13.' });
    expect(sentMessages[4]).toMatchObject({ role: 'user' });
    expect(sentMessages[4].content).toContain('¿tenés stock de ese?');
  });

  it('si la llamada a Claude falla, devuelve el mensaje de ayuda', async () => {
    const { cap } = makeCapability({ ANTHROPIC_API_KEY: 'sk-test' });
    (cap as unknown as { client: unknown }).client = {
      messages: { create: jest.fn().mockRejectedValue(new Error('sin red')) },
    };

    const reply = await cap.handle('una pregunta cualquiera', CTX);

    expect(reply).toBe(HELP_TEXT);
  });

  it('ANTHROPIC_WEB_SEARCH=off deja la búsqueda web fuera del set de tools', () => {
    const { cap } = makeCapability({ ANTHROPIC_API_KEY: 'sk-test', ANTHROPIC_WEB_SEARCH: 'off' });
    const tools = (
      cap as unknown as { toolDefinitions: () => { type?: string }[] }
    ).toolDefinitions();
    expect(tools.some((t) => t.type === 'web_search_20250305')).toBe(false);
  });
});
