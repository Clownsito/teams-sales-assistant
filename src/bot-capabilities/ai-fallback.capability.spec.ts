import { ConfigService } from '@nestjs/config';
import { HELP_TEXT } from '../teams/message-formatter';
import { CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { AiFallbackCapability } from './ai-fallback.capability';

const CTX: CapabilityContext = { sellerId: 'seller-1', conversationId: 'c1' };

function fakeConfig(values: Record<string, string | undefined>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

describe('AiFallbackCapability', () => {
  it('sin ANTHROPIC_API_KEY, canHandle es false y el router cae a la ayuda', () => {
    const cap = new AiFallbackCapability(new ConversationMemoryService(), fakeConfig({}));

    expect(cap.canHandle('cualquier pregunta rara', CTX)).toBe(false);
  });

  it('con IA disponible, responde con el texto del modelo', async () => {
    const cap = new AiFallbackCapability(
      new ConversationMemoryService(),
      fakeConfig({ ANTHROPIC_API_KEY: 'sk-test' }),
    );
    const create = jest.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'Para un cliente nuevo conviene el iPhone SE por reventa.' }],
    });
    (cap as unknown as { client: unknown }).client = { messages: { create } };

    const reply = await cap.handle('¿iPhone SE o Galaxy A15 para alguien que recién arranca?', CTX);

    expect(create).toHaveBeenCalled();
    expect(reply).toContain('iPhone SE');
  });

  it('si la llamada a Claude falla, devuelve el mensaje de ayuda', async () => {
    const cap = new AiFallbackCapability(
      new ConversationMemoryService(),
      fakeConfig({ ANTHROPIC_API_KEY: 'sk-test' }),
    );
    (cap as unknown as { client: unknown }).client = {
      messages: { create: jest.fn().mockRejectedValue(new Error('sin red')) },
    };

    const reply = await cap.handle('una pregunta cualquiera', CTX);

    expect(reply).toBe(HELP_TEXT);
  });
});
