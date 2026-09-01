import { Inject, Injectable, Logger } from '@nestjs/common';
import { HELP_TEXT } from '../teams/message-formatter';
import { BOT_CAPABILITIES, BotCapability } from './bot-capability.interface';

/**
 * Prueba las capacidades en orden y delega en la primera que reconozca el
 * mensaje. Si ninguna lo reconoce, responde con el mensaje de ayuda. Ver ADR-003.
 */
@Injectable()
export class CapabilityRouter {
  private readonly logger = new Logger('CapabilityRouter');

  constructor(
    @Inject(BOT_CAPABILITIES) private readonly capabilities: BotCapability[],
  ) {}

  async route(text: string, sellerId: string): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return HELP_TEXT;

    for (const capability of this.capabilities) {
      if (capability.canHandle(trimmed)) {
        this.logger.log(`"${trimmed}" -> ${capability.name}`);
        return capability.handle(trimmed, sellerId);
      }
    }

    this.logger.log(`"${trimmed}" -> sin capacidad, se responde ayuda`);
    return HELP_TEXT;
  }
}
