// Tokens de inyección de dependencias. El módulo que arma la app real
// (AdaptersModule) decide qué implementación concreta corresponde a cada
// token según el tenant — hoy apunta al mock, mañana a un adaptador real.
export const INVENTORY_ADAPTER = Symbol('INVENTORY_ADAPTER');
export const SALES_ADAPTER = Symbol('SALES_ADAPTER');
export const STOCK_CACHE = Symbol('STOCK_CACHE');
