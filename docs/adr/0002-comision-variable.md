# ADR-002: Comisión del vendedor como parámetro variable, no valor fijo

**Estado:** Aceptada
**Fecha:** 2026-09-01
**Deciders:** Esteban (desarrollador único)

## Contexto

El diseño original asumía una comisión fija del 5% guardada como configuración del tenant. Al revisar el diseño, se identificó que distintos vendedores (o incluso distintos productos) pueden tener comisiones distintas, y que fijar el 5% en el sistema generaría trabajo de rediseño apenas apareciera el primer caso real con una tasa distinta.

## Decisión

El % de comisión no se guarda como valor fijo del sistema. Se recibe como **parámetro de cada consulta** (el vendedor lo indica al preguntar, ej. "cuánto gané este mes con 8% de comisión"), con un valor por defecto opcional guardado por vendedor si no lo menciona.

## Opciones consideradas

### Opción A: Tasa fija por tenant (5% para todos) — descartada
**Pros:** más simple de implementar.
**Contras:** no soporta vendedores o productos con comisiones distintas; requiere cambio de esquema y migración el día que aparezca esa necesidad.

### Opción B: Tasa como parámetro de consulta, con default opcional por vendedor (elegida)
**Pros:** soporta cualquier variación (por vendedor, por producto, por campaña) sin cambiar el modelo de datos ni el código de cálculo; el vendedor mantiene control total y visibilidad de qué tasa se está usando en cada respuesta.
**Contras:** el parser de intención debe saber extraer un porcentaje del texto además del rango de precio — un poco más de lógica en el `IntentParser`, pero acotada.

### Opción C: Tasa configurable por vendedor únicamente (guardada, editable por un admin)
**Pros:** no depende de que el vendedor la mencione cada vez.
**Contras:** sigue sin resolver el caso de comisión distinta por producto o campaña sin volver a tocar el modelo; menos flexible que la Opción B, que además puede incluir el default de esta opción como fallback.

## Análisis de trade-offs

La Opción B es estrictamente más flexible que A y C, y las incluye como casos particulares (el "default por vendedor" de C queda disponible como fallback dentro de B). El único costo real es un poco más de trabajo en el parser de intención — aceptable frente al riesgo de tener que rediseñar el modelo de datos apenas el primer cliente real tenga comisiones variables.

## Consecuencias

- Se facilita: soportar cualquier estructura de comisión futura sin cambios de esquema.
- Se dificulta: ligeramente, el parseo de la pregunta del vendedor (debe reconocer un porcentaje en el texto).
- A revisitar: si en el futuro se necesitan reglas de comisión más complejas (por ejemplo, escalonadas por volumen), probablemente se necesite un motor de reglas en vez de un solo parámetro — no es necesario todavía.

## Ítems de acción

1. [ ] Definir el formato esperado del parámetro `commissionRate` en el endpoint de resumen de ventas
2. [ ] Agregar reconocimiento de porcentaje al `IntentParser`
3. [ ] Agregar campo opcional de tasa por defecto en la entidad `Salesperson`
