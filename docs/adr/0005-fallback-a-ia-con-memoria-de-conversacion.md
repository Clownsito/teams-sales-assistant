# ADR-005: Memoria de conversación y fallback con IA para preguntas fuera de patrón

**Estado:** Aceptada
**Fecha:** 2026-09-01
**Deciders:** Esteban (desarrollador único)

## Contexto

Con el router de capacidades (ADR-003) el bot resuelve bien las preguntas estructuradas (stock por precio, comisión del mes, margen, proyección). Quedaban dos huecos para que se sienta un asistente y no un formulario:

1. **Seguimientos.** Un vendedor pregunta una proyección y después dice "¿y si lo vendo 10% más caro?" o "¿y con 12% de comisión?". Sin memoria de la conversación, esas frases no tienen a qué referirse y caen al mensaje de ayuda.
2. **Preguntas abiertas.** "¿Le conviene el iPhone SE o el Galaxy A15 a un cliente que recién arranca?", "el cliente dice que en otro lado se lo dejan más barato, ¿qué le contesto?". No son consultas de datos: ninguna regla las puede cubrir.

ADR-003 ya dejó la puerta abierta a esto: la interfaz `BotCapability` no distingue cómo resuelve cada capacidad (regla, cálculo, o una llamada externa), así que sumar una capacidad que use un LLM no toca el router ni las demás. ADR-003 también había pospuesto el LLM "por ahora" por no querer asumir una API key; ahora sí se suma, pero **solo como último recurso**, no como intérprete principal.

## Decisión

Dos piezas nuevas dentro de `src/bot-capabilities/`:

### 1. `ConversationMemoryService` + `FollowUpCapability`

- **`ConversationMemoryService`**: store en memoria del proceso, con TTL de 30 min por inactividad, indexado por el `conversation.id` de Teams. Guarda dos cosas: (a) un **resumen estructurado del último cálculo** (intención, cantidad, precio unitario, tasa, costo/venta, producto) que usan los seguimientos por reglas, y (b) un **historial corto de los últimos mensajes** (hasta 10 intercambios usuario↔bot, cada uno recortado), que el router graba en cada turno y que el fallback de IA reenvía como mensajes previos para sostener una racha de preguntas abiertas relacionadas.
- Las capacidades de cálculo (stock, comisión, margen, proyección) escriben ese resumen al responder.
- **`FollowUpCapability`** va **primera** en el orden del router. Reconoce ajustes sobre lo último ("y si...", "y con...", "10% más caro", "el costo sube a X") y **rehace el último cálculo** con el cambio, reusando el mismo cálculo y formato que la capacidad original. Si no hay nada recordado o el ajuste no se entiende, no matchea.

### 2. `AiFallbackCapability`

- Va **última** en el orden del router: solo la ven las preguntas que ninguna capacidad de reglas reconoció.
- Llama a la API de Claude (SDK oficial `@anthropic-ai/sdk`) con un system prompt que la acota al dominio de ventas y le pide respuestas breves.
- **Degradación limpia**: sin `ANTHROPIC_API_KEY`, `canHandle` devuelve `false` y el router cae al mensaje de ayuda fijo — el bot funciona igual sin la IA. Si la API falla en runtime, también responde la ayuda.
- Por defecto usa el modelo más barato (`claude-haiku-4-5`), configurable con `ANTHROPIC_MODEL`. Como el fallback solo ve preguntas simples y de bajo volumen, no se justifica un modelo más caro.

Las cuatro capacidades de reglas siguen resolviendo todo lo que reconocen: el LLM nunca ve una pregunta que una regla podía contestar.

## Opciones consideradas

### Opción A: Pasar a interpretar toda pregunta con un LLM — descartada (otra vez)
**Pros:** cubre lenguaje libre sin escribir patrones.
**Contras:** costo por cada consulta (incluidas las estructuradas, que son la mayoría) y respuestas menos predecibles para cálculos donde una regla da el número exacto. Sigue valiendo lo de ADR-003.

### Opción B: Reglas + memoria + LLM solo como fallback de último recurso — elegida
**Pros:** los seguimientos naturales funcionan de verdad; las preguntas abiertas tienen respuesta útil; el costo queda acotado (solo lo que ninguna regla reconoce, con el modelo más barato); si no hay API key, el bot no se rompe. No cambia el router ni las capacidades existentes: son dos clases nuevas en la lista.
**Contras:** la memoria es por proceso (un nodo); el fallback depende de una API externa (costo, latencia, disponibilidad).

### Opción C: Sin LLM, solo un mejor mensaje de ayuda — descartada
**Pros:** cero dependencia externa.
**Contras:** el objetivo es "todas las preguntas que se le puedan ocurrir a un vendedor", y eso incluye consejo comercial abierto que un mensaje de ayuda no cubre.

## Consecuencias

- Se facilita: encadenar ajustes ("10% más caro" y después "y con 12% de comisión") sin repetir los datos; que preguntas abiertas de venta tengan una respuesta en vez de un mensaje de ayuda; probar todo junto con `npm run demo`.
- Se dificulta: la memoria vive en el proceso — con más de una instancia hay que moverla a Redis (misma interfaz, misma idea que el cache de stock). El fallback agrega una dependencia externa con su costo y su latencia.
- A revisitar: si el fallback se usa mucho, medir el costo real y evaluar subir el modelo o cachear respuestas frecuentes; memoria multi-nodo → Redis; hoy el `FollowUpCapability` entiende un set acotado de ajustes (precio ±%, precio/costo/venta absoluto, cantidad, comisión) — se puede ampliar.

## Ítems de acción

1. [x] `ConversationMemoryService` (store por `conversation.id`, TTL por inactividad).
2. [x] Pasar `CapabilityContext` (`sellerId` + `conversationId`) a `canHandle`/`handle`; las capacidades de cálculo escriben el resumen.
3. [x] `FollowUpCapability` — primera en el router; rehace la última proyección o margen con el ajuste pedido.
4. [x] `AiFallbackCapability` — última en el router; SDK de Anthropic; degradación a la ayuda sin API key o ante error.
5. [x] Script `npm run demo` que recorre una conversación con las 6 capacidades y guarda `demo-transcript.md`.
6. [ ] A futuro: memoria en Redis para correr con más de una instancia.
