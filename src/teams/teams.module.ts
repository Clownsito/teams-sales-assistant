import { Module } from '@nestjs/common';
import { BotCapabilitiesModule } from '../bot-capabilities/bot-capabilities.module';
import { TeamsController } from './teams.controller';
import { TeamsBotService } from './teams-bot.service';
import { teamsAdapterProvider } from './teams.adapter';

/**
 * Capa de entrada de Microsoft Teams (Bot Framework). Traduce actividades del
 * bot a llamadas sobre el CapabilityRouter (ADR-003); toda la lógica vive en
 * las capacidades de BotCapabilitiesModule.
 */
@Module({
  imports: [BotCapabilitiesModule],
  controllers: [TeamsController],
  providers: [teamsAdapterProvider, TeamsBotService],
})
export class TeamsModule {}
