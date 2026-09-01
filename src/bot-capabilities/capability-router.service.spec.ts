import { HELP_TEXT } from '../teams/message-formatter';
import { BotCapability, CapabilityContext } from './bot-capability.interface';
import { CapabilityRouter } from './capability-router.service';

const CTX: CapabilityContext = { sellerId: 'seller-1', conversationId: 'c1' };

function fakeCapability(
  name: string,
  matches: boolean,
  reply = `respuesta de ${name}`,
): BotCapability {
  return {
    name,
    canHandle: jest.fn().mockReturnValue(matches),
    handle: jest.fn().mockResolvedValue(reply),
  };
}

describe('CapabilityRouter', () => {
  it('usa la primera capacidad cuyo canHandle devuelve true y no prueba las siguientes', async () => {
    const first = fakeCapability('first', true);
    const second = fakeCapability('second', true);
    const router = new CapabilityRouter([first, second]);

    const reply = await router.route('hola', CTX);

    expect(reply).toBe('respuesta de first');
    expect(first.handle).toHaveBeenCalledWith('hola', CTX);
    expect(second.canHandle).not.toHaveBeenCalled();
    expect(second.handle).not.toHaveBeenCalled();
  });

  it('salta las capacidades que no matchean y usa la primera que sí', async () => {
    const skipped = fakeCapability('skipped', false);
    const chosen = fakeCapability('chosen', true);
    const router = new CapabilityRouter([skipped, chosen]);

    const reply = await router.route('hola', CTX);

    expect(skipped.handle).not.toHaveBeenCalled();
    expect(chosen.handle).toHaveBeenCalled();
    expect(reply).toBe('respuesta de chosen');
  });

  it('devuelve el mensaje de ayuda cuando ninguna capacidad matchea', async () => {
    const router = new CapabilityRouter([
      fakeCapability('a', false),
      fakeCapability('b', false),
    ]);

    expect(await router.route('algo raro', CTX)).toBe(HELP_TEXT);
  });

  it('devuelve el mensaje de ayuda si el texto viene vacío, sin probar capacidades', async () => {
    const only = fakeCapability('only', true);
    const router = new CapabilityRouter([only]);

    expect(await router.route('   ', CTX)).toBe(HELP_TEXT);
    expect(only.canHandle).not.toHaveBeenCalled();
  });
});
