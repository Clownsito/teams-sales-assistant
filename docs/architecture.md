# Arquitectura: Asistente de Ventas para Microsoft Teams

## 1. Requisitos

### Funcionales
- El vendedor consulta stock en lenguaje natural dentro de un chat de Teams (ej. "qué teléfonos tienes entre $20.000 y $50.000").
- El sistema devuelve disponibilidad en tiempo (casi) real: producto, precio, cantidad en bodega.
- El vendedor consulta sus métricas del mes: total vendido, comisión, margen/ganancia neta — el % de comisión no es fijo, lo indica el propio vendedor al preguntar (ej. "cuánto gané este mes con 8% de comisión"), porque puede variar entre vendedores o incluso entre productos.
- El sistema debe ser agnóstico al ERP/CMS/controlador de inventario del cliente — conectar uno nuevo no debe tocar el resto del sistema.

### No funcionales
- Latencia baja en el chat (la conversación con el cliente está pasando en vivo).
- Datos de stock frescos — el ERP se actualiza a diario, así que "tiempo real" real es innecesario; segundos/minutos de rezago son aceptables.
- Multi-tenant: más de una empresa/ERP distinto en el futuro, cada una con su propia configuración y aislamiento de datos.
- Seguridad: credenciales del ERP por cliente, identidad del vendedor vía Teams, y que un vendedor solo vea su propia comisión.
- Degradación controlada si el ERP del cliente falla o está lento.

### Restricciones
- Desarrollador único, nivel junior — evitar sobre-ingeniería.
- Proyecto de portafolio: debe ser demostrable y con alcance acotado, no una plataforma enterprise desde el día uno.
- Stack conocido: NestJS/TypeScript + MySQL/TypeORM (ya usado en tu API de inventario), también Python/FastAPI y AWS.

**Recomendación de stack: NestJS.** Reutiliza lo que ya sabes de tu proyecto de inventario, y su sistema de módulos/inyección de dependencias calza natural con una arquitectura de adaptadores plugeables — además refuerza tu narrativa de portafolio (dos proyectos que muestran el mismo nivel de arquitectura backend).

## 2. Diseño de alto nivel

```
Vendedor (Teams)
      │
      ▼
Teams Bot (Bot Framework / webhook)
      │
      ▼
Backend NestJS
 ├── IntentParser        (extrae filtros: rango de precio, categoría, o "quiero mi comisión")
 ├── StockQueryModule ───► InventoryAdapter ───► API del ERP del cliente
 │                              │
 │                              ▼
 │                          Redis (cache corto, 5–15 min)
 ├── SalesMetricsModule ─► SalesAdapter ───────► API del ERP del cliente
 │                              │
 │                              ▼
 │                          MySQL (config de tenant, snapshots de comisión)
 └── AdapterRegistry     (decide qué adaptador usar según el tenant)
      │
      ▼
Respuesta formateada (Adaptive Card) → Teams
```

**Contrato del adaptador** (la pieza clave para que sea "independiente"):

```typescript
interface InventoryAdapter {
  getStock(filters: { minPrice?: number; maxPrice?: number; category?: string }): Promise<StockItem[]>;
}

interface SalesAdapter {
  getSalesBySeller(sellerId: string, range: { from: Date; to: Date }): Promise<SaleRecord[]>;
}
```

Cada ERP nuevo (SAP, un CMS a medida, una base de datos propia, lo que sea) implementa estas dos interfaces traduciendo su formato al modelo interno. Todo lo demás — el bot, el cálculo de comisión, el cacheo — no cambia.

## 3. Detalle

### Modelo de datos (MySQL / TypeORM)
- **Tenant**: id, nombre, tipo de ERP, URL base, API key (encriptada)
- **Salesperson**: id, tenant_id, teams_user_id, nombre, tasa de comisión por defecto (opcional — solo como valor sugerido si el vendedor no indica una al preguntar)
- **StockCache** (opcional, si el ERP no soporta filtros en vivo): sku, nombre, categoría, precio, cantidad, última sincronización
- **CommissionQuery** (no es config, es el resultado de cada consulta): seller_id, mes, ventas_brutas, tasa_comisión_usada, monto_comisión, margen_neto — la tasa viaja como parámetro de la consulta, no como dato fijo guardado por vendedor

### Endpoints internos
- `POST /webhook/teams` — recibe eventos del Bot Framework
- `GET /stock?tenantId=&minPrice=&maxPrice=&category=`
- `GET /sales/:sellerId/summary?month=&commissionRate=` — `commissionRate` lo entrega el vendedor en la pregunta (el `IntentParser` lo extrae del texto, ej. "con 8% de comisión"); si no lo indica, se usa el valor por defecto guardado en `Salesperson`
- `POST /admin/tenants` — onboarding de un nuevo cliente/ERP

### Cache
Redis con TTL de 5–15 min por combinación tenant+filtros — como el ERP se actualiza a diario, este margen es seguro y evita golpear la API del cliente en cada pregunta. El snapshot de comisión se cachea por vendedor/mes y se invalida al pedir un refresco o pasada la medianoche.

### Manejo de errores
Si el ERP no responde: reintento con backoff (2-3 intentos) y, si sigue fallando, se muestra el último dato en caché con aviso ("stock de hace X minutos, no pude actualizar"). Nunca debe caerse el chat completo por un ERP externo lento.

## 4. Escala y confiabilidad

Para un proyecto de portafolio, la carga es mínima (pocos vendedores, consultas ocasionales) — no hace falta escalar horizontalmente todavía. Aun así, el backend queda **sin estado** (todo en Redis/MySQL) para poder replicarlo sin fricción si un cliente real lo necesita.

Monitoreo clave: latencia y tasa de error por adaptador — si el ERP de un cliente empieza a fallar, quieres saberlo antes que el vendedor.

## 5. Decisiones y trade-offs

- **Capa de adaptadores desde el día uno**: agrega algo de complejidad, pero es literalmente la propuesta de valor (agnóstico al ERP) — se mantiene la interfaz mínima (2 métodos) para no sobre-diseñar.
- **NestJS sobre FastAPI**: por experiencia previa reciente y porque el sistema de módulos encaja mejor con adaptadores plugeables.
- **Parseo de intención simple (reglas/regex) antes que LLM**: para preguntas estructuradas ("rango de precio", "mi comisión") un parser simple es suficiente y más barato/predecible que un LLM; se puede migrar a IA generativa después si se quiere lenguaje más libre.
- **No duplicar datos de ventas si el ERP los expone bien**: mejor pedirlos en vivo (con cache corto) que mantener una copia local que se puede desincronizar — solo se guarda localmente si el ERP no da un desglose limpio por vendedor.
- **Comisión variable en vez de fija al 5%**: en vez de una tasa única guardada por tenant, el % de comisión se recibe como parámetro en cada consulta (con un valor por defecto opcional por vendedor). Esto evita reescribir el sistema cuando cambie la comisión de un vendedor, cuando dos vendedores tengan tasas distintas, o cuando la empresa quiera variar la comisión por producto en el futuro — el cálculo (`ventas_brutas * tasa`) es el mismo, solo cambia de dónde viene la tasa.
- **Multi-tenant desde el modelo, no desde el día uno en infraestructura**: se define el modelo Tenant pensando en más de un cliente, pero sin construir aislamiento pesado hasta tener un segundo cliente real.

**Qué revisar cuando crezca**: convertir la capa de adaptadores en una librería propia (podría ser parte de tu portafolio como paquete open-source), migrar el parser a LLM si las preguntas se vuelven más libres, separar stock y ventas en servicios distintos si la carga lo justifica, soportar reglas de comisión distintas por tenant si el 5% fijo deja de ser suficiente.
