/**
 * Una capacidad del bot: una unidad independiente que reconoce un tipo de
 * pregunta del vendedor y la resuelve. Ver ADR-003.
 *
 * La interfaz no dice CÓMO decide `canHandle` ni cómo resuelve `handle`
 * (regex hoy, quizás una API externa o un LLM mañana) — solo qué recibe y
 * qué devuelve. Agregar una capacidad nueva es agregar una clase a la lista
 * inyectada bajo el token BOT_CAPABILITIES, sin tocar el router ni las demás.
 */
export interface BotCapability {
  /** Identificador corto, para logs y tests. */
  readonly name: string;

  /**
   * ¿Esta capacidad reconoce el mensaje? Debe ser barato y síncrono: solo
   * mira el texto, no llama a servicios. Si hay dudas sobre si aplica,
   * conviene devolver false y dejar que otra capacidad (o el fallback) responda.
   */
  canHandle(text: string): boolean;

  /**
   * Resuelve el mensaje y devuelve el texto a enviar al vendedor. Si dentro
   * detecta que falta un dato, responde pidiéndolo en vez de asumir un valor.
   */
  handle(text: string, sellerId: string): Promise<string>;
}

/**
 * Token DI para la lista ordenada de capacidades. El orden importa: el
 * router usa la primera cuyo `canHandle` devuelva true (ver
 * bot-capabilities.module.ts).
 */
export const BOT_CAPABILITIES = Symbol('BOT_CAPABILITIES');
