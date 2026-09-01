import { Injectable, Logger } from '@nestjs/common';
import { ActivityHandler, MessageFactory, TurnContext } from 'botbuilder';
import { CapabilityRouter } from '../bot-capabilities/capability-router.service';
import { WELCOME_TEXT } from './message-formatter';

/**
 * Capa de entrada del bot: recibe el mensaje de Teams y delega en el
 * CapabilityRouter, que decide qué capacidad lo responde (ADR-003). Este
 * servicio no conoce las capacidades ni la lógica de negocio — solo el SDK
 * del bot y el router.
 */
@Injectable()
export class TeamsBotService extends ActivityHandler {
  private readonly logger = new Logger('TeamsBot');

  constructor(private readonly router: CapabilityRouter) {
    super();

    this.onMessage(async (context, next) => {
      const text = (TurnContext.removeRecipientMention(context.activity) ?? '').trim();
      const sellerId = context.activity.from?.id ?? 'unknown';
      this.logger.log(`Mensaje de ${sellerId}: "${text}"`);

      const reply = await this.buildReply(text, sellerId);
      await context.sendActivity(MessageFactory.text(reply));
      await next();
    });

    this.onMembersAdded(async (context, next) => {
      const botId = context.activity.recipient?.id;
      for (const member of context.activity.membersAdded ?? []) {
        if (member.id !== botId) {
          await context.sendActivity(MessageFactory.text(WELCOME_TEXT));
        }
      }
      await next();
    });
  }

  /**
   * Punto de entrada testeable: delega en el router. Se mantiene como método
   * propio para poder probar el ruteo sin levantar el SDK del bot.
   */
  async buildReply(text: string, sellerId: string): Promise<string> {
    return this.router.route(text, sellerId);
  }
}
