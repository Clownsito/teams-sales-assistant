import { Module } from '@nestjs/common';
import { IntentModule } from '../intent/intent.module';
import { StockModule } from '../stock/stock.module';
import { SalesModule } from '../sales/sales.module';
import { TeamsController } from './teams.controller';
import { TeamsBotService } from './teams-bot.service';
import { teamsAdapterProvider } from './teams.adapter';

/**
 * Capa de entrada de Microsoft Teams (Bot Framework). Reutiliza tal cual
 * IntentParserService, StockService y SalesService — este módulo solo
 * traduce mensajes del bot a llamadas sobre esos servicios.
 */
@Module({
  imports: [IntentModule, StockModule, SalesModule],
  controllers: [TeamsController],
  providers: [teamsAdapterProvider, TeamsBotService],
})
export class TeamsModule {}
