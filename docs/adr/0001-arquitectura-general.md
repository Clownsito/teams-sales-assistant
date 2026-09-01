# ADR-001: Arquitectura del asistente de ventas para Microsoft Teams

**Estado:** Aceptada
**Fecha:** 2026-09-01
**Decisores:** Esteban (desarrollador único)

## Contexto

Se quiere construir, como proyecto de portafolio, un asistente de IA dentro de Microsoft Teams que ayude a vendedores a: (1) consultar stock disponible filtrado por rango de precio, obteniendo los datos directo del ERP/CMS/controlador de inventario que use cada empresa cliente, y (2) consultar sus métricas de venta del mes con el cálculo de comisión y margen.

Restricciones: desarrollador junior trabajando solo, sin fecha de entrega externa, con experiencia previa reciente en NestJS/TypeScript + MySQL/TypeORM (API de inventario) y también en Python/FastAPI, PHP y AWS (Lambda, API Gateway, DynamoDB, EKS, Terraform). El sistema debe funcionar con cualquier ERP del cliente sin reescribirse — es la propuesta de valor central.

## Decisión

Construir un backend en **NestJS/TypeScript** que expone la lógica de negocio detrás de una interfaz de adaptador (`InventoryAdapter`, `SalesAdapter`), con Redis como cache de consultas de stock, MySQL/TypeORM para configuración de tenants y snapshots, y un bot de Microsoft Teams (Bot Framework) como capa de conversación. Cada ERP nuevo se integra escribiendo un adaptador que traduce su formato al modelo interno, sin tocar el resto del sistema.

## Opciones consideradas

### Opción A: NestJS monolito modular + capa de adaptadores (elegida)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Media — un solo despliegue, módulos bien separados |
| Costo | Bajo — se puede alojar en un solo servicio (Railway, Render, EC2 chico) |
| Escalabilidad | Suficiente para el alcance de portafolio; stateless, escalable horizontalmente después |
| Familiaridad del equipo | Alta — mismo stack que la API de inventario ya construida |

**Pros:** reutiliza experiencia y código mental reciente; el sistema de módulos/DI de NestJS encaja natural con adaptadores plugeables; un solo repo y despliegue simplifica el desarrollo en solitario; buena narrativa de portafolio (arquitectura limpia, no solo un script).
**Contras:** un monolito eventualmente puede volverse difícil de escalar por partes si un cliente real crece mucho — mitigable después separando módulos en servicios si hace falta.

### Opción B: Funciones serverless (AWS Lambda + API Gateway) por capacidad

| Dimensión | Evaluación |
|---|---|
| Complejidad | Alta — orquestar varias funciones, IAM, y estado compartido (cache) entre ellas |
| Costo | Muy bajo en reposo, pero variable |
| Escalabilidad | Excelente, pero es escala que este proyecto no necesita todavía |
| Familiaridad del equipo | Alta (ya usa Lambda/API Gateway/Terraform) |

**Pros:** encajaría con su experiencia AWS y podría sumar a su narrativa "cloud-native".
**Contras:** más piezas de infraestructura que mantener para un beneficio que no se necesita a esta escala; complica el desarrollo local y las pruebas; sobre-ingeniería para un MVP de portafolio.

### Opción C: Low-code (Power Virtual Agents / Power Automate + Dataverse)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja para armar el bot, pero rígida para lógica de negocio custom |
| Costo | Depende de licenciamiento Microsoft 365/Power Platform |
| Escalabilidad | Limitada por el propio low-code |
| Familiaridad del equipo | Baja — no es su stack |

**Pros:** integración nativa con Teams sin escribir un bot desde cero.
**Contras:** no demuestra habilidades de desarrollo backend (contradice el objetivo de portafolio), y la capa de adaptadores agnóstica al ERP es más difícil de expresar en low-code.

### Opción D: Backend en Python/FastAPI en vez de NestJS

| Dimensión | Evaluación |
|---|---|
| Complejidad | Similar a Opción A |
| Costo | Similar |
| Escalabilidad | Similar |
| Familiaridad del equipo | Alta, pero sin el precedente reciente de una arquitectura de adaptadores ya construida en este stack |

**Pros:** también es stack conocido.
**Contras:** no reutiliza el patrón ya trabajado en la API de inventario NestJS; dos proyectos de portafolio en el mismo stack (NestJS) refuerzan más la narrativa de dominio backend que dos proyectos en stacks distintos sin conexión entre sí.

## Análisis de trade-offs

La decisión prioriza **reutilización de experiencia reciente y valor de portafolio** por sobre "usar la tecnología más escalable posible" — a esta escala (un desarrollador, pocos usuarios, sin cliente real todavía), la escalabilidad de Lambda o la integración nativa de Power Platform no compensan la complejidad o la pérdida de una demostración clara de habilidades backend. La capa de adaptadores es la única pieza que no se negocia, independiente del stack elegido, porque es el corazón de la propuesta ("funciona con cualquier ERP").

## Consecuencias

- Se facilita: desarrollo rápido en solitario, reutilización de patrones de TypeORM ya conocidos, una historia de portafolio coherente entre dos proyectos.
- Se dificulta: si en el futuro se necesita escalar a muchos tenants con cargas muy distintas, el monolito necesitará dividirse — decisión a revisar en ese momento, no ahora.
- A revisitar: mover la capa de adaptadores a un paquete npm independiente si se reutiliza en otros proyectos; evaluar separar el módulo de stock del de ventas en servicios distintos si la carga real lo justifica.

## Ítems de acción

1. [ ] Crear el proyecto NestJS base con los módulos: `stock`, `sales`, `adapters`, `tenants`
2. [ ] Definir las interfaces `InventoryAdapter` y `SalesAdapter`
3. [ ] Implementar un adaptador mock con datos falsos para probar el flujo sin ERP real
4. [ ] Configurar Redis y MySQL/TypeORM localmente (docker-compose)
5. [ ] Integrar el Bot Framework de Teams como capa de entrada

