# ADR-003: Router de capacidades extensible, sin LLM por ahora

**Estado:** Aceptada
**Fecha:** 2026-09-01
**Deciders:** Esteban (desarrollador único)

## Contexto

El bot debía crecer de dos intenciones fijas (stock, resumen de comisión mensual) a un asistente que responda preguntas más variadas y libres de un vendedor: proyecciones hipotéticas de venta ("cuánto ganaría si vendo 50 teléfonos con tal % de comisión"), cálculo de margen costo/venta, y en general "todas las preguntas que se le puedan ocurrir a un vendedor". Esto es justo el escenario que ADR-001 marcó como "a revisitar": si el lenguaje se vuelve más libre, el parser de reglas dejaría de alcanzar.

Se evaluó pasar a interpretar las preguntas con un modelo de lenguaje (Claude), pero el usuario decidió explícitamente no agregar una API key de un proveedor de IA por ahora. Al mismo tiempo, quiere dejar la puerta abierta a que, más adelante, una capacidad puntual sí use una API externa con su propia key (ejemplo mencionado: consultar precios de la competencia vía scraping/API).

## Decisión

En vez de seguir agregando `if/else` e intentar meter cada vez más lógica en `IntentParserService` y en `teams-bot.service.ts`, se introduce un **router de capacidades**: cada capacidad del bot (stock, resumen de comisión, calculadora de margen, proyección de venta hipotética, y cualquier futura) es una unidad independiente con la forma:

```typescript
interface BotCapability {
  name: string;
  canHandle(text: string): boolean;
  handle(text: string, sellerId: string): Promise<string>;
}
```

Un `CapabilityRouter` prueba las capacidades en orden y usa la primera que reconozca la pregunta; si ninguna reconoce, responde con el mensaje de ayuda. Agregar una capacidad nueva (incluida una que llame a una API externa con su propia key, cuando se decida) es agregar una clase nueva a la lista — no toca las demás ni el router.

## Opciones consideradas

### Opción A: Seguir extendiendo el parser de reglas actual con más `if/else` — descartada
**Pros:** cero refactor.
**Contras:** cada intención nueva vuelve más frágil y larga la misma función; mezclar reglas de detección con la lógica de negocio de cada respuesta hace difícil razonar sobre una sola capacidad sin leer todo el archivo.

### Opción B: Pasar a interpretación con LLM (Claude + tool use) — descartada por ahora
**Pros:** cubre lenguaje libre sin escribir un patrón por cada forma de preguntar; es la solución más robusta a largo plazo.
**Contras:** requiere una API key de un proveedor de IA y su costo asociado, que el usuario decidió no asumir por el momento.

### Opción C: Router de capacidades basado en reglas, con interfaz uniforme (elegida)
**Pros:** cada capacidad se entiende y se prueba de forma aislada; agregar una nueva no toca las existentes; dentro de cada capacidad se puede usar tanto una regla simple (regex) como, en el futuro, una llamada a una API externa — la interfaz `BotCapability` no distingue cómo resuelve internamente, solo qué recibe y qué devuelve. Esto deja la puerta abierta a la Opción B más adelante: se podría agregar una capacidad que use un LLM sin rehacer el router.
**Contras:** sigue sin entender preguntas verdaderamente libres/ambiguas — cada capacidad todavía reconoce patrones específicos, así que preguntas muy fuera de lo esperado caen al mensaje de ayuda en vez de una respuesta inteligente.

## Análisis de trade-offs

La Opción C es un punto intermedio consciente: no resuelve el límite de fondo de un parser basado en reglas (seguirá sin entender cualquier pregunta posible), pero sí resuelve el problema de mantenibilidad inmediato, y — a diferencia de seguir con la Opción A — dejar la interfaz `BotCapability` desacoplada de "cómo" cada capacidad decide si aplica significa que el día que se quiera sumar una capacidad que llame a una API externa (con su propia key, como la consulta de precios de competencia) o incluso una capacidad que use un LLM, se agrega sin tocar el resto.

## Consecuencias

- Se facilita: agregar capacidades nuevas de forma aislada y testeable; que cada capacidad futura decida su propia forma de resolver (regla, cálculo puro, o llamada externa) sin acoplarse a las demás.
- Se dificulta: preguntas verdaderamente ambiguas o mal formuladas seguirán sin respuesta útil — el router no "adivina", solo reconoce patrones.
- A revisitar: si el catálogo de capacidades crece mucho o las preguntas siguen sin encajar en patrones, la Opción B (LLM) vuelve a ser la alternativa natural — la interfaz `BotCapability` ya deja espacio para eso sin rediseñar.

## Ítems de acción

1. [x] Crear `src/bot-capabilities/` con la interfaz `BotCapability` y el `CapabilityRouter`.
2. [x] Migrar las intenciones existentes (stock, resumen de comisión) a esta forma.
3. [x] Agregar `MarginCalculatorCapability` (costo vs. precio de venta).
4. [x] Agregar `SaleProjectionCapability` (proyección hipotética: cantidad × precio, con % de comisión).
5. [x] Actualizar `teams-bot.service.ts` para delegar en el `CapabilityRouter`.
6. [ ] A futuro: capacidad que consulte precios de la competencia vía API externa (con su propia key), como primer caso de una capacidad que no resuelve con una regla local.
