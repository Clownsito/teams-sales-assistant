# ADR-006: Tono formal, respuestas honestas y búsqueda web real en el fallback de IA

**Estado:** Aceptada
**Fecha:** 2026-09-01
**Deciders:** Esteban (desarrollador único)

## Contexto

Al probar `AiFallbackCapability` (ADR-005) en el Bot Framework Emulator con preguntas libres reales, aparecieron tres problemas concretos, todos en la misma pieza del sistema:

1. **Tono equivocado**: el system prompt actual hace que Claude responda con modismos rioplatenses ("che", "boludo", "¡Ey!" con emojis). Esteban es chileno y quiere un registro 100% formal — el prompt no está fijando ni el dialecto ni el nivel de formalidad, así que el modelo cae en su propio default.
2. **Respuestas deshonestas o en loop**: ante preguntas de stock que no matchean el regex de la capacidad por reglas (ej. "dame todos los disponibles", "dame el stock en 25.000 disponible", "muestrame el inventario"), la IA responde cosas como *"no tengo acceso a los datos de stock en tiempo real, andá a preguntarle a logística"* — lo cual es falso: el stock sí está disponible vía `StockService`/`InventoryAdapter`, la misma tool que ADR-005 dice que la IA tiene. Esto es peor que el viejo mensaje de ayuda genérico (ADR-003): ahí al menos no afirmaba nada incorrecto. En otros casos, en vez de mentir, entra en un loop pidiendo cada vez más specificidad ("¿qué modelo?", "¿qué línea o código?") en lugar de resolver con lo que ya tiene o admitir honestamente que no puede.
3. **Expectativa de acceso a internet**: Esteban esperaba que, teniendo una API key de Anthropic, el bot pudiera buscar información externa (ej. "dame los precios del iPhone 17 de la competencia en marketplaces"). Esto no es así: el modelo por sí solo solo "sabe" lo que aprendió hasta su fecha de corte de entrenamiento, no navega la web — tener una API key no agrega browsing automático. Para que Claude busque información real y actual hace falta agregar explícitamente una *tool* de búsqueda web a la llamada (Anthropic ofrece una nativa, del lado del servidor, con costo aparte). Esto no es un bug de lo ya construido: es una capacidad que nunca se agregó, y que ADR-003 ya había anotado como "a futuro" (ahí mencionada como consulta de precios de competencia vía scraping/API externa).

Los tres problemas comparten causa: el system prompt y el set de tools de `AiFallbackCapability` quedaron subespecificados una vez que se probó con preguntas reales y variadas, no solo con el guion feliz del demo.

## Decisión

Se ajusta `AiFallbackCapability` en tres frentes, sin tocar el router de reglas ni las demás capacidades:

1. **Registro fijo en el system prompt**: español neutro/formal, sin modismos regionales (ni rioplatenses ni de ningún otro país) — un tono profesional-cercano, nunca vulgar ni con apodos, consistente sin importar quién lo lea.
2. **Contrato de honestidad + prioridad de tools**: si la pregunta puede resolverse con una tool existente (stock, margen, comisión, proyección), la IA debe intentar llamarla — incluyendo un modo "sin filtro" para stock, que devuelva el catálogo completo cuando el vendedor no da rango de precio ni producto puntual. Si ninguna tool resuelve la pregunta (producto que no existe, dato realmente fuera de alcance), la respuesta estándar es una frase honesta y única del tipo "no cuento con esa información" — nunca inventar una limitación de acceso que no existe, y nunca encadenar más de una pregunta aclaratoria antes de intentar responder con lo que ya se tiene.
3. **Tool de búsqueda web real**: se agrega la tool nativa de búsqueda web de Anthropic (`web_search`, del lado del servidor — Claude decide cuándo usarla y trae resultados con fuente citada) al listado de tools de `AiFallbackCapability`, acotada explícitamente a preguntas de contexto externo/mercado/competencia. Las preguntas sobre datos propios (stock, comisión, margen) siguen resolviéndose siempre con las tools internas, nunca con búsqueda web, para no romper la garantía de ADR-005 de que esos números nunca se alucinan.

## Opciones consideradas

### Opción A: Ajustar solo el prompt (tono + honestidad), sin agregar búsqueda web — descartada como única solución
**Pros:** cero costo adicional, cero dependencia nueva.
**Contras:** deja sin resolver la mitad del reclamo original — el bot seguiría sin poder responder ninguna pregunta que dependa de información externa real (precios de competencia, contexto de mercado), que es justo lo que se esperaba de "una IA que responda cualquier pregunta".

### Opción B: Reemplazar todo por un scraper propio a sitios de competencia específicos — descartada por ahora
**Pros:** control total sobre qué y cómo se extrae, sin depender de un buscador general.
**Contras:** mucho más trabajo de implementación y mantenimiento (parsers por sitio, manejo de bloqueos/cambios de HTML) para resolver algo que la tool nativa de búsqueda ya cubre de forma genérica y con mucho menos código. Queda anotado como algo a revisitar si en el futuro se necesita extracción estructurada y repetible de un competidor puntual, no para la necesidad actual de "responder preguntas abiertas con datos reales de internet".

### Opción C: Prompt formal + contrato de honestidad + tool de búsqueda web nativa de Anthropic (elegida)
**Pros:** resuelve los tres problemas encontrados con el mínimo cambio de superficie — un ajuste de prompt y una tool más, reutilizando lo que Anthropic ya expone en su API en vez de construir infraestructura de scraping propia. Mantiene la garantía de "no alucina" para datos internos, porque la búsqueda web queda acotada a preguntas externas.
**Contras:** costo variable adicional, pequeño pero real (~US$10 cada 1000 búsquedas, además de los tokens ya facturados) — para el volumen de un demo de portafolio es centavos, pero es un costo que no existía antes. Además hay que ser cuidadoso en el prompt para que la IA no termine "buscando en internet" algo que en realidad vive en el propio sistema (stock, comisión) — si eso pasa, se pierde la garantía de datos reales que era el punto central de ADR-005.

## Análisis de trade-offs

Los tres cambios se agrupan en un solo ADR porque surgieron de la misma ronda de prueba manual y apuntan al mismo objetivo — que el fallback de IA sea confiable, no solo conversacionalmente fluido —, pero son ítems de acción separables: se puede (y probablemente conviene) implementar primero el tono y la honestidad (sin costo, resuelve lo más grave: que el bot mienta) y recién después sumar la búsqueda web como una mejora de alcance.

## Consecuencias

- Se facilita: el bot deja de inventar limitaciones falsas y de sonar como un chat informal de otro país; puede responder preguntas genuinas sobre el mercado/la competencia con información real y citada, no solo sobre los datos internos del sistema.
- Se dificulta: aparece un costo variable nuevo (búsqueda web), pequeño pero a monitorear si el uso crece; el system prompt se vuelve más largo/delicado porque tiene que separar claramente "esto se responde con tools internas" de "esto se responde buscando en la web", y una redacción floja ahí podría hacer que la IA use la web para algo que debería salir del sistema interno.
- A revisitar: si las preguntas de competencia se vuelven frecuentes y apuntan siempre a los mismos sitios/formatos, evaluar la Opción B (scraping dirigido) para respuestas más estructuradas y baratas que una búsqueda general repetida.

## Ítems de acción

1. [x] Reescribir el system prompt de `AiFallbackCapability`: español formal/neutro, sin modismos regionales, tono profesional-cercano.
2. [x] Agregar/confirmar el modo "sin filtro" de la tool de stock (catálogo completo cuando no se especifica precio ni producto).
3. [x] Definir en el prompt la respuesta estándar de "no lo sé" (una sola frase honesta, sin loops de reclarificación ni afirmaciones de "no tengo acceso" cuando la tool existe).
4. [x] Agregar la tool `web_search` (nativa de Anthropic) al listado de tools de `AiFallbackCapability`, con instrucciones explícitas de usarla solo para preguntas de contexto externo/mercado/competencia, nunca para datos internos. Kill-switch por `ANTHROPIC_WEB_SEARCH`.
5. [x] Volver a probar las frases que fallaron ("dame todos los disponibles", "dame el stock en 25.000 disponible", "muestrame el inventario", "precios del iPhone 17 de la competencia") — verificado vía `POST /api/messages` (el mismo camino que usa el Emulator): tono formal + respuestas reales u honestas.
6. [x] `.env.example` / README actualizados con `ANTHROPIC_WEB_SEARCH` y la nota de costo.

## Notas de implementación

- `AiFallbackCapability` pasó de una llamada plana a un **loop de tool use** (`client.messages.create` en bucle, máx. 5 iteraciones, maneja `pause_turn` de la búsqueda web). Las 4 tools internas (`consultar_stock`, `calcular_margen`, `proyectar_venta`, `resumen_comision`) son wrappers finos sobre `StockService` / `SalesService` / `computeMargin` / `computeProjection` — no se duplica lógica de cálculo.
- Se usa la variante básica `web_search_20250305`, compatible con `claude-haiku-4-5` (el modelo por defecto) y con modelos más nuevos.
- Para preguntas de precio en la competencia sin país indicado, el prompt fija **Chile / pesos chilenos** como default (el catálogo interno está en CLP); si el usuario menciona otro país o moneda, se respeta. Cuando exista multi-tenant, esto pasaría a ser un ajuste por tenant.
- Ante cualquier error de la API o si se agotan las iteraciones, sigue cayendo al mensaje de ayuda fijo (degradación de ADR-005 intacta).
