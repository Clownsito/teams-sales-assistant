import { Logger, Provider } from '@nestjs/common';
import {
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext,
} from 'botbuilder';
import { TEAMS_ADAPTER } from './teams.constants';

/**
 * Arma el CloudAdapter del Bot Framework y lo expone como provider de Nest.
 *
 * Sin TEAMS_APP_ID / TEAMS_APP_PASSWORD el adaptador funciona en modo
 * anónimo — suficiente para probar con el Bot Framework Emulator en local,
 * sin registrar nada en Azure. Al integrar Teams real, se completan esas
 * dos variables (y opcionalmente TEAMS_APP_TYPE / TEAMS_APP_TENANT_ID) en
 * el .env y el mismo código pasa a validar la autenticación.
 */
export const teamsAdapterProvider: Provider = {
  provide: TEAMS_ADAPTER,
  useFactory: (): CloudAdapter => {
    const logger = new Logger('TeamsAdapter');

    const auth = new ConfigurationBotFrameworkAuthentication({
      MicrosoftAppId: process.env.TEAMS_APP_ID ?? '',
      MicrosoftAppPassword: process.env.TEAMS_APP_PASSWORD ?? '',
      MicrosoftAppType: process.env.TEAMS_APP_TYPE ?? 'MultiTenant',
      MicrosoftAppTenantId: process.env.TEAMS_APP_TENANT_ID ?? '',
    });

    const adapter = new CloudAdapter(auth);

    adapter.onTurnError = async (context: TurnContext, error: Error): Promise<void> => {
      logger.error(`Error procesando la actividad: ${error.message}`, error.stack);
      await context.sendActivity(
        'Ups, algo falló procesando tu mensaje. Intenta de nuevo en un momento.',
      );
    };

    return adapter;
  },
};
