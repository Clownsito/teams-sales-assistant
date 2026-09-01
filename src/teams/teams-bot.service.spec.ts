import { CapabilityRouter } from '../bot-capabilities/capability-router.service';
import { CapabilityContext } from '../bot-capabilities/bot-capability.interface';
import { TeamsBotService } from './teams-bot.service';

describe('TeamsBotService', () => {
  it('buildReply delega en el CapabilityRouter pasándole texto y contexto', async () => {
    const route = jest.fn().mockResolvedValue('respuesta del router');
    const bot = new TeamsBotService({ route } as unknown as CapabilityRouter);
    const ctx: CapabilityContext = { sellerId: 'seller-1', conversationId: 'c1' };

    const reply = await bot.buildReply('lo que sea', ctx);

    expect(route).toHaveBeenCalledWith('lo que sea', ctx);
    expect(reply).toBe('respuesta del router');
  });
});
