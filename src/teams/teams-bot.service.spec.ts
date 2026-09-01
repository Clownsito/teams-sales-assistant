import { CapabilityRouter } from '../bot-capabilities/capability-router.service';
import { TeamsBotService } from './teams-bot.service';

describe('TeamsBotService', () => {
  it('buildReply delega en el CapabilityRouter pasándole texto y sellerId', async () => {
    const route = jest.fn().mockResolvedValue('respuesta del router');
    const bot = new TeamsBotService({ route } as unknown as CapabilityRouter);

    const reply = await bot.buildReply('lo que sea', 'seller-1');

    expect(route).toHaveBeenCalledWith('lo que sea', 'seller-1');
    expect(reply).toBe('respuesta del router');
  });
});
