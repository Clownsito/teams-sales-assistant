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
└── tenants/         # Entidades TypeORM: Tenant y Salesperson.
```

Todavía no incluye la integración real con el Bot Framework de Teams — por ahora los módulos se prueban vía HTTP directo (`GET /stock`, `GET /sales/:sellerId/summary`). Ese es el siguiente paso natural una vez que el resto esté probado.

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

## Probar los endpoints

```bash
# Stock por rango de precio
curl "http://localhost:3000/stock?minPrice=20000&maxPrice=50000"

# Resumen de ventas con comisión indicada en la consulta
curl "http://localhost:3000/sales/seller-1/summary?month=2026-08&commissionRate=0.08"
```

## Tests

```bash
npm test
```

## Siguientes pasos (ver ADR-001, ítems de acción)

1. Integrar el Bot Framework de Teams como capa de entrada, reutilizando `IntentParserService` para interpretar los mensajes.
2. Implementar un adaptador real para un ERP concreto (implementando `InventoryAdapter`/`SalesAdapter`) una vez que exista un cliente/caso real.
3. Reemplazar `InMemoryCacheAdapter` por un adaptador de Redis (misma interfaz `StockCache`, sin tocar `StockService`).
4. Endpoint de administración para dar de alta un nuevo tenant (`POST /admin/tenants`).
