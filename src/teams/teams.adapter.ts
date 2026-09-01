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
 * - **Sin `TEAMS_APP_ID`** → modo anónimo. La autenticación queda deshabilitada
 *   y el Bot Framework Emulator conecta sin credenciales. NO se pasan
 *   `MicrosoftAppType` ni `MicrosoftAppTenantId`: sin App ID no aplican y solo
 *   agregan caminos de validación al SDK.
 * - **Con `TEAMS_APP_ID`** → modo autenticado para Teams / Azure real. Ahí sí se
 *   usan `TEAMS_APP_PASSWORD` y, para `SingleTenant` / `UserAssignedMsi`,
 *   `TEAMS_APP_TYPE` + `TEAMS_APP_TENANT_ID`.
 */
export const teamsAdapterProvider: Provider = {
  provide: TEAMS_ADAPTER,
  useFactory: (): CloudAdapter => {
    const logger = new Logger('TeamsAdapter');
    const appId = process.env.TEAMS_APP_ID?.trim() ?? '';

    const authConfig: Record<string, string> = { MicrosoftAppId: appId };
    if (appId) {
      authConfig.MicrosoftAppPassword = process.env.TEAMS_APP_PASSWORD ?? '';
      authConfig.MicrosoftAppType = process.env.TEAMS_APP_TYPE?.trim() || 'MultiTenant';
      authConfig.MicrosoftAppTenantId = process.env.TEAMS_APP_TENANT_ID?.trim() ?? '';
    }

    const adapter = new CloudAdapter(
      new ConfigurationBotFrameworkAuthentication(authConfig),
    );

    logger.log(
      appId
        ? `Bot Framework autenticado (App ID ${appId})`
        : 'Bot Framework en modo anónimo (sin TEAMS_APP_ID) — OK para el Emulator local',
    );

    adapter.onTurnError = async (context: TurnContext, error: Error): Promise<void> => {
      // Los errores del connector (RestError de @typespec/ts-http-runtime) suelen
      // traer message vacío; se loguean code/statusCode/url para ver la causa real.
      const e = error as {
        message?: string;
        name?: string;
        code?: string;
        statusCode?: number;
        request?: { url?: string };
      };
      const bits = [
        e.statusCode != null ? `HTTP ${e.statusCode}` : null,
        e.code ?? null,
        e.request?.url ? `-> ${e.request.url}` : null,
      ].filter(Boolean);
      logger.error(
        `Error procesando la actividad: ${e.message || e.name || 'sin mensaje'}` +
          (bits.length ? ` (${bits.join(' ')})` : ''),
        error.stack,
      );

      try {
        await context.sendActivity(
          'Ups, algo falló procesando tu mensaje. Intenta de nuevo en un momento.',
        );
      } catch {
        logger.error('Tampoco se pudo entregar la respuesta de error al canal.');
      }
    };

    return adapter;
  },
};
