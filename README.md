# Teams Sales Assistant

Asistente de IA para Microsoft Teams que ayuda a vendedores a: consultar stock disponible por rango de precio (en tiempo casi real, sacado directo del ERP/CMS del cliente) y calcular sus métricas de venta mensuales con comisión y margen — todo agnóstico al sistema de inventario que use cada empresa.

Ver el diseño completo en `docs/architecture.md` y las decisiones registradas en `docs/adr/`.

## Cómo está armado

```
src/
├── adapters/        # La pieza central: interfaces InventoryAdapter y SalesAdapter,
│                     # más un adaptador mock para desarrollar sin ERP real todavía.
├── intent/          # Parser simple (reglas, no LLM) que extrae rango de precio
│                     # y % de comisión del texto del vendedor.
├── stock/           # Consulta de stock con cache corto (ver StockService).
├── sales/           # Cálculo de comisión/margen — la tasa es siempre un
│                     # parámetro, nunca un valor fijo (ver ADR-002).
├── bot-capabilities/ # Router de capacidades (ADR-003 + ADR-005). Cada cosa
│                     # que el bot sabe hacer es una BotCapability: stock,
│                     # comisión del mes, margen, proyección, seguimientos
│                     # con memoria ("y si lo vendo 10% más caro"), y un
│                     # fallback con Claude para lo que ninguna regla cubre.
│                     # El router prueba canHandle en orden y usa la primera.
├── teams/           # Capa de entrada de Microsoft Teams (Bot Framework):
│                     # webhook POST /api/messages; delega en el router.
├── health/          # Endpoint GET /health (@nestjs/terminus) para el
│                     # balanceador de carga — verifica la conexión a MySQL.
└── tenants/         # Entidades TypeORM: Tenant y Salesperson.

scripts/
└── demo-conversation.ts  # `npm run demo`: recorre una conversación completa
                          # contra el bot y guarda demo-transcript.md.
```

La capa de Teams (`src/teams/`) es solo **entrada**: recibe la actividad del bot y la pasa al `CapabilityRouter`. Cada capacidad (`src/bot-capabilities/`) reutiliza la lógica que ya existe (`IntentParserService`, `StockService`, `SalesService`) — no reimplementa parseo ni cálculo. Agregar una capacidad nueva es una clase nueva en la lista, sin tocar las demás ni el router (ver ADR-003). Los endpoints HTTP directos (`GET /stock`, `GET /sales/:sellerId/summary`) siguen disponibles para pruebas.

## Requisitos

- Node.js 20+
- Docker (para MySQL y Redis locales) — Redis aún no está conectado en el código, se usa un cache en memoria (`InMemoryCacheAdapter`) con la misma interfaz que tendrá el adaptador de Redis.

## Cómo correrlo

```bash
npm install
cp .env.example .env
docker compose up -d      # levanta MySQL (Redis queda listo para cuando se conecte)
npm run start:dev
```

## Probar los endpoints HTTP

```bash
# Stock por rango de precio
curl "http://localhost:3000/stock?minPrice=20000&maxPrice=50000"

# Resumen de ventas con comisión indicada en la consulta
curl "http://localhost:3000/sales/seller-1/summary?month=2026-08&commissionRate=0.08"
```

## Probar el bot con el Bot Framework Emulator

No hace falta registrar nada en Azure ni en Teams para probar el bot en local.
Con `TEAMS_APP_ID` / `TEAMS_APP_PASSWORD` vacíos en el `.env`, el adaptador
corre en modo anónimo.

1. Instalar el [Bot Framework Emulator](https://github.com/microsoft/BotFramework-Emulator/releases)
   (app de escritorio, Windows/macOS/Linux).
2. Levantar la app: `npm run start:dev`.
3. En el Emulator: **Open Bot** →
   - **Bot URL:** `http://localhost:3000/api/messages`
   - **Microsoft App ID / Password:** dejar en blanco
   - Connect.
4. (Opcional) Para que el resumen de ventas devuelva datos del mock, el
   `sellerId` sale del ID de usuario del Emulator. En **Emulator → Settings**
   (o el ícono de engranaje del chat) poné **User ID = `seller-1`**, que es el
   vendedor con ventas de ejemplo cargadas (`src/adapters/mock/mock-sales.adapter.ts`).

Mensajes de prueba — una por cada capacidad del router (ADR-003 + ADR-005).
Las de `follow-up` dependen de lo que se preguntó **antes** en el mismo hilo:

| Escribís | Capacidad | Qué hace |
| --- | --- | --- |
| `teléfonos entre 20.000 y 50.000` | `stock-lookup` | `parseStockQuery` → `StockService.queryStock` → lista formateada |
| `qué hay bajo 30000` | `stock-lookup` | Igual, solo con `maxPrice` |
| `cuánto gané este mes con 8% de comisión` | `commission-summary` | `parseSalesQuery` detecta el 8% → `SalesService.getMonthlySummary` → resumen real del mes |
| `cuánto vendí este mes` | `commission-summary` | Rutea por palabra clave; sin `%` ni default guardado, pide el porcentaje (ADR-002) |
| `cuesta 34.000 y lo vendo en 40.000, ¿qué margen me da?` | `margin-calculator` | Ganancia $6.000 · margen sobre venta 15,00% · markup sobre costo 17,65% |
| ↳ `y si el costo sube a 36.000` | `follow-up` | Rehace el margen anterior con el nuevo costo (memoria del hilo) |
| `cuánto ganaría si vendo 50 a 30.000 con 8% de comisión` | `sale-projection` | 50 × $30.000 = $1.500.000 → tu comisión sería $120.000 |
| ↳ `y si lo vendo 10% más caro` | `follow-up` | Toma el precio unitario recordado, lo sube 10% y recalcula |
| ↳ `y con 12% de comisión` | `follow-up` | Recalcula la proyección solo cambiando la tasa |
| `si vendo 3 iPhone SE con 8% de comisión` | `sale-projection` | Sin precio en la frase: lo toma del stock (iPhone SE = $49.990) |
| `si vendo 50 a 30.000` | `sale-projection` | Falta el % → responde pidiéndolo, no asume |
| `¿le conviene el iPhone SE o el Galaxy A15 a un cliente que recién arranca?` | `ai-fallback` | Ninguna regla la cubre → la responde Claude (si hay `ANTHROPIC_API_KEY`) |
| `hola` | — | Ninguna capacidad matchea y no hay IA → mensaje de ayuda |

### Demo de una conversación entera

Con el bot corriendo (`npm run start:dev`), en otra terminal:

```bash
npm run demo
```

Manda una conversación completa contra `POST /api/messages` en un solo hilo
(una pregunta por capacidad + los seguimientos con memoria + preguntas
abiertas), imprime cada intercambio con colores y guarda el transcript en
`demo-transcript.md`. Las preguntas abiertas solo las contesta la IA si hay
`ANTHROPIC_API_KEY` en el `.env`; sin eso responden el mensaje de ayuda.

### Probarlo sin el Emulator (curl)

El webhook es HTTP normal y se puede simular una actividad del bot. La
respuesta del bot **no** vuelve en el cuerpo de la petición: el adaptador la
envía con un `POST` a `{serviceUrl}/v3/conversations/{id}/activities/...`.
Para verla hay que levantar un endpoint que haga de `serviceUrl` (rol que
normalmente cumple el Emulator).

```bash
# 1) Un "connector" mínimo que imprime lo que responde el bot
node -e 'require("http").createServer((q,s)=>{let b="";q.on("data",c=>b+=c);q.on("end",()=>{try{console.log("\nBOT:",JSON.parse(b).text)}catch{};s.writeHead(200,{"Content-Type":"application/json"});s.end("{}")})}).listen(3979,()=>console.log("connector en :3979"))' &

# 2) Enviar un mensaje al webhook (serviceUrl apunta al connector de arriba)
curl -i -X POST http://localhost:3000/api/messages \
  -H "Content-Type: application/json" \
  -d '{"type":"message","id":"1","channelId":"emulator","serviceUrl":"http://localhost:3979","from":{"id":"seller-1"},"recipient":{"id":"bot"},"conversation":{"id":"c1"},"text":"teléfonos entre 20000 y 50000"}'
```

El webhook responde `200` y en la consola del connector aparece el texto del
bot. (Si `serviceUrl` no es alcanzable, el adaptador no puede entregar la
respuesta y el webhook devuelve `500` — con el Emulator esto no pasa.)

## Tests

```bash
npm test
```

En cada push a `master` y en cada PR, GitHub Actions (`.github/workflows/ci.yml`)
corre `npm ci`, `tsc --noEmit`, la build de producción y `npm test`.

## Despliegue

El proyecto se despliega como **contenedor Docker estándar**. El mismo artefacto
corre igual en AWS (ECS/Fargate, App Runner, Elastic Beanstalk) que en Azure
(Container Apps, App Service para contenedores); cuál proveedor y qué servicio
puntual se usa se decide más adelante (ver [ADR-004](docs/adr/0004-preparacion-para-despliegue-en-la-nube.md)).

### Construir y correr la imagen

```bash
docker build -t teams-sales-assistant .

docker run --rm -p 3000:3000 --env-file .env teams-sales-assistant
# o pasando las variables una por una con -e VAR=valor
```

La imagen es multi-stage: compila con las devDependencies y la imagen final
(`node:20-alpine`) lleva solo `node_modules` de producción + `dist/`, corre como
usuario `node` y trae un `HEALTHCHECK` que pega a `/health`.

### Health check

`GET /health` → `200` con `{"status":"ok",...}` si la app responde y MySQL
contesta un ping; `503` si la base no está accesible. Es el endpoint que debe
configurarse como health check del balanceador / servicio de contenedores.

### Variables de entorno en producción

| Variable | Requerida | Default | Descripción |
| --- | --- | --- | --- |
| `PORT` | no | `3000` | Puerto HTTP en el que escucha la app. |
| `DB_HOST` | **sí** | `localhost` | Host de MySQL (una instancia administrada: RDS, Azure Database for MySQL, etc.). |
| `DB_PORT` | no | `3306` | Puerto de MySQL. |
| `DB_USER` | **sí** | `teams_assistant` | Usuario de MySQL. |
| `DB_PASSWORD` | **sí** | `change-me` | Password de MySQL — inyectar desde el secret manager del proveedor, nunca en la imagen. |
| `DB_NAME` | **sí** | `teams_sales_assistant` | Nombre de la base. |
| `CACHE_TTL_SECONDS` | no | `300` | TTL del cache de stock. |
| `TEAMS_APP_ID` | para Teams real | vacío | App ID del Bot Framework. Vacío = modo anónimo (solo sirve para el Emulator local). |
| `TEAMS_APP_PASSWORD` | para Teams real | vacío | Client secret del bot — desde el secret manager. |
| `TEAMS_APP_TYPE` | no | `MultiTenant` | `MultiTenant` / `SingleTenant` / `UserAssignedMSI`. |
| `TEAMS_APP_TENANT_ID` | si `SingleTenant` | vacío | Tenant de Azure AD del bot. |
| `ANTHROPIC_API_KEY` | no | vacío | Habilita el fallback con IA (ADR-005). Sin ella, las preguntas fuera de patrón responden el mensaje de ayuda. |
| `ANTHROPIC_MODEL` | no | `claude-haiku-4-5` | Modelo del fallback. El default es el más barato. |
| `ANTHROPIC_WORKSPACE_ID` | si la key es de workspace | vacío | ID del workspace (`wrkspc_...`) para API keys asociadas a uno. |

> **Nota:** hoy TypeORM corre con `synchronize: true` (crea/ajusta tablas al
> arrancar), práctico para el portafolio. Para un despliegue productivo real hay
> que pasar a migraciones y poner `synchronize: false`.

## Siguientes pasos (ver ADR-001, ítems de acción)

1. ~~Integrar el Bot Framework de Teams como capa de entrada~~ — hecho (`src/teams/`). Falta: registrar la app en Azure/Teams, resolver el `tenantId` desde el team/canal (hoy fijo en `default`), y usar el AAD object id real como `sellerId`.
2. Respuestas como Adaptive Cards en vez de texto plano (cambio acotado a `src/teams/message-formatter.ts`).
3. Implementar un adaptador real para un ERP concreto (implementando `InventoryAdapter`/`SalesAdapter`) una vez que exista un cliente/caso real.
4. Reemplazar `InMemoryCacheAdapter` por un adaptador de Redis (misma interfaz `StockCache`, sin tocar `StockService`).
5. Endpoint de administración para dar de alta un nuevo tenant (`POST /admin/tenants`).
