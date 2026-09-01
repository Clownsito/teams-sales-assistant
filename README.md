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
├── teams/           # Capa de entrada de Microsoft Teams (Bot Framework):
│                     # webhook POST /api/messages + ruteo de intención.
│                     # Reutiliza intent/, stock/ y sales/ tal cual.
└── tenants/         # Entidades TypeORM: Tenant y Salesperson.
```

La capa de Teams (`src/teams/`) es solo **entrada**: traduce el mensaje del vendedor a una llamada sobre `IntentParserService` + `StockService` / `SalesService` y devuelve el resultado formateado. No reimplementa parseo ni cálculo. Los mismos endpoints HTTP directos (`GET /stock`, `GET /sales/:sellerId/summary`) siguen disponibles para pruebas.

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

Mensajes de prueba:

| Escribís | Qué hace |
| --- | --- |
| `teléfonos entre 20.000 y 50.000` | `IntentParserService.parseStockQuery` → `StockService.queryStock` → lista formateada |
| `qué hay bajo 30000` | Igual, solo con `maxPrice` |
| `cuánto gané este mes con 8% de comisión` | `parseSalesQuery` detecta el 8% → `SalesService.getMonthlySummary` → resumen |
| `cuánto vendí este mes` | Se rutea a ventas por palabra clave; sin `%` ni default guardado, responde pidiendo el porcentaje (ADR-002) |
| `hola` | No reconoce intención → pide reformular |

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

## Siguientes pasos (ver ADR-001, ítems de acción)

1. ~~Integrar el Bot Framework de Teams como capa de entrada~~ — hecho (`src/teams/`). Falta: registrar la app en Azure/Teams, resolver el `tenantId` desde el team/canal (hoy fijo en `default`), y usar el AAD object id real como `sellerId`.
2. Respuestas como Adaptive Cards en vez de texto plano (cambio acotado a `src/teams/message-formatter.ts`).
3. Implementar un adaptador real para un ERP concreto (implementando `InventoryAdapter`/`SalesAdapter`) una vez que exista un cliente/caso real.
4. Reemplazar `InMemoryCacheAdapter` por un adaptador de Redis (misma interfaz `StockCache`, sin tocar `StockService`).
5. Endpoint de administración para dar de alta un nuevo tenant (`POST /admin/tenants`).
