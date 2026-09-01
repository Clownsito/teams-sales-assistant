# ADR-004: Preparar el proyecto para desplegarse en AWS o Azure (sin elegir todavía cuál)

**Estado:** Aceptada
**Fecha:** 2026-09-01
**Deciders:** Esteban (desarrollador único)

## Contexto

El proyecto hoy corre solo local (Docker Compose para MySQL/Redis, Nest en modo desarrollo). Quiero dejarlo listo para desplegarse más adelante en AWS o Azure — tanto para que el portafolio muestre una pieza "lista para producción", como porque el proyecto podría usarse de verdad algún día con un cliente. Todavía no hay decidido un cliente real, presupuesto de cloud, ni preferencia firme entre AWS o Azure, así que no tiene sentido comprometerse hoy a servicios específicos de un proveedor (por ejemplo Lambda vs Azure Functions).

## Decisión

Preparar el proyecto para desplegarse como **contenedor Docker estándar**, sin atarlo a un proveedor específico todavía. Un contenedor Docker corre igual en AWS (ECS/Fargate, App Runner, Elastic Beanstalk) que en Azure (Container Apps, App Service para contenedores) — la decisión de cuál proveedor y qué servicio puntual usar se pospone hasta que exista una razón real para elegir uno (precio, un cliente que ya use uno de los dos, o para practicar algo puntual de la certificación AWS que ya tiene).

Se agrega también lo mínimo que cualquier despliegue en la nube espera de una app: un endpoint de salud (`/health`) para que el balanceador de carga sepa si la instancia está viva, una build de CI que corra tests en cada push (evidencia de calidad para el portafolio), y documentación clara de qué variables de entorno necesita correr en producción.

## Opciones consideradas

### Opción A: Comprometerse ahora a un proveedor y servicio específico (ej. AWS Lambda) — descartada
**Pros:** aprovecharía la experiencia y certificación AWS ya existente.
**Contras:** ADR-001 ya descartó serverless para este proyecto por complejidad innecesaria a esta escala; además, decidir el proveedor antes de tener un caso de uso real (o un cliente) es una apuesta sin información — se estaría optimizando para una entrega que todavía no existe.

### Opción B: Contenedor Docker genérico, decisión de proveedor pospuesta (elegida)
**Pros:** el mismo artefacto (imagen Docker) sirve para probar en cualquiera de los dos proveedores el día que se decida; no se pierde el trabajo de contenerizar sea cual sea la elección final; es además la forma más común de desplegar un backend Nest hoy en día, independiente del proveedor.
**Contras:** no se aprovecha ninguna característica específica de un proveedor (por ejemplo autoscaling nativo de Lambda) — aceptable, porque a esta escala no se necesita.

## Análisis de trade-offs

Esto es consistente con el criterio ya usado en ADR-001 (priorizar simplicidad y evitar comprometerse a infraestructura que el proyecto no necesita todavía). Contenerizar es trabajo que sirve pase lo que pase después; elegir proveedor específico ahora sería trabajo que podría no servir.

## Consecuencias

- Se facilita: probar el despliegue en cualquiera de los dos proveedores más adelante sin rehacer nada; tener una imagen reproducible (mismo comportamiento en local, CI, y producción); mostrar en el portafolio prácticas reales de preparación para producción (health check, CI, Dockerfile) sin necesidad de pagar por infraestructura real todavía.
- Se dificulta: nada específico de AWS o Azure está optimizado — el día que se elija un proveedor, puede valer la pena una segunda pasada para aprovechar sus servicios administrados (ej. RDS en vez de MySQL en un contenedor propio).
- A revisitar: cuando exista una razón concreta para elegir AWS o Azure (cliente, costo, o querer practicar algo puntual), definir el servicio exacto de cómputo, la base de datos administrada, y el pipeline de despliegue continuo.

## Ítems de acción

1. [x] `Dockerfile` multi-stage (build + runtime liviano) para la app NestJS.
2. [x] `.dockerignore` (node_modules, dist, .env, etc.)
3. [x] Endpoint `/health` con `@nestjs/terminus`, verificando conexión a MySQL.
4. [x] Workflow de GitHub Actions: instalar dependencias, `tsc --noEmit`, `npm test` en cada push/PR.
5. [x] Sección "Despliegue" en el README: variables de entorno requeridas en producción, cómo construir y correr la imagen, y una nota explicando que el proveedor (AWS/Azure) se decide después.
