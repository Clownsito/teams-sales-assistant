import { Controller, Inject, Post, Req, Res } from '@nestjs/common';
// Request/Response mínimos del propio SDK (compatibles con el req/res de
// Express que inyecta Nest) — evita depender de @types/express.
import { CloudAdapter, Request, Response } from 'botbuilder';
import { TeamsBotService } from './teams-bot.service';
import { TEAMS_ADAPTER } from './teams.constants';

/**
 * Webhook que espera el Bot Framework: todas las actividades de Teams (y del
 * Emulator) llegan como POST /api/messages. El adaptador se encarga de la
 * autenticación y de escribir la respuesta HTTP; nosotros solo le pasamos el
 * turno al bot.
 */
@Controller('api/messages')
export class TeamsController {
  constructor(
    @Inject(TEAMS_ADAPTER) private readonly adapter: CloudAdapter,
    private readonly bot: TeamsBotService,
  ) {}

  @Post()
  async handleMessages(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.adapter.process(req, res, (context) => this.bot.run(context));
  }
}
