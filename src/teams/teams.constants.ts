// Token de inyección para el adaptador de Bot Framework. El controller y el
// bot service dependen de este token, no de una instancia concreta de
// CloudAdapter — así el wiring del SDK queda aislado en teams.adapter.ts.
export const TEAMS_ADAPTER = Symbol('TEAMS_ADAPTER');

// Tenant que se usa para las consultas de stock que llegan por el bot.
// Multi-tenant real (resolver el tenant desde el team/canal de Teams) es un
// paso posterior; ver docs/adr/ y "Siguientes pasos" del README.
export const BOT_TENANT_ID = 'default';
