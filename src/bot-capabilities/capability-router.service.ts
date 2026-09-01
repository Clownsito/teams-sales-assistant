import { Inject, Injectable, Logger } from '@nestjs/common';
import { HELP_TEXT } from '../teams/message-formatter';
import {
  BOT_CAPABILITIES,
  BotCapability,
  CapabilityContext,
} from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';

/**
 * Prueba las capacidades en orden y delega en la primera que reconozca el
 * mensaje. Si ninguna lo reconoce, responde con el mensaje de ayuda. Ver ADR-003.
 *
 * Además guarda cada intercambio (pregunta + respuesta) en la memoria de la
 * conversación, para que el fallback de IA tenga el historial reciente.
 */
@Injectable()
export class CapabilityRouter {
  private readonly logger = new Logger('CapabilityRouter');

  constructor(
    @Inject(BOT_CAPABILITIES) private readonly capabilities: BotCapability[],
    private readonly memory: ConversationMemoryService,
  ) {}

  async route(text: string, ctx: CapabilityContext): Promise<string> {
    const trimmed = text.trim();
    if (!trimmed) return HELP_TEXT;

    const reply = await this.resolve(trimmed, ctx);
    this.memory.appendTurn(ctx.conversationId, trimmed, reply);
    return reply;
  }

  private async resolve(trimmed: string, ctx: CapabilityContext): Promise<string> {
    for (const capability of this.capabilities) {
      if (capability.canHandle(trimmed, ctx)) {
        this.logger.log(`"${trimmed}" -> ${capability.name}`);
        return capability.handle(trimmed, ctx);
      }
    }

    this.logger.log(`"${trimmed}" -> sin capacidad, se responde ayuda`);
    return HELP_TEXT;
  }
}
