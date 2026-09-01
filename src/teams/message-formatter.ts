import { StockItem } from '../adapters/interfaces/inventory-adapter.interface';
import { CommissionSummary } from '../sales/sales.service';
import { ParsedStockQuery } from '../intent/intent-parser.service';

/**
 * Convierte los resultados de StockService / SalesService en texto listo
 * para enviar a Teams. Funciones puras, sin dependencias de Nest ni del
 * SDK del bot — fáciles de testear y de cambiar a Adaptive Cards más
 * adelante sin tocar la lógica de ruteo del bot.
 */

const clp = new Intl.NumberFormat('es-CL');
const money = (value: number): string =>
  value < 0 ? `-$${clp.format(Math.abs(value))}` : `$${clp.format(value)}`;

const pctFmt = new Intl.NumberFormat('es-CL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const percent = (value: number): string => `${pctFmt.format(value)}%`;

export const HELP_TEXT = [
  'No entendí la consulta. Puedo ayudarte con cuatro cosas:',
  '• **Stock por precio** — ej. "teléfonos entre 20.000 y 50.000".',
  '• **Tu comisión del mes** — ej. "cuánto gané este mes con 8% de comisión".',
  '• **Margen costo/venta** — ej. "cuesta 34.000 y lo vendo en 40.000, ¿qué margen me da?".',
  '• **Proyección de venta** — ej. "cuánto ganaría si vendo 50 a 30.000 con 8% de comisión".',
].join('\n');

export const WELCOME_TEXT = [
  '¡Hola! Soy el asistente de ventas. Puedo ayudarte con:',
  '• Stock por rango de precio.',
  '• Tu comisión del mes (indicá el %).',
  '• Margen entre precio de costo y de venta.',
  '• Proyección: cuánto ganarías vendiendo N unidades a tal precio con tal % de comisión.',
].join('\n');

function describeRange(query: ParsedStockQuery): string {
  const parts: string[] = [];
  if (query.minPrice !== undefined) parts.push(`desde ${money(query.minPrice)}`);
  if (query.maxPrice !== undefined) parts.push(`hasta ${money(query.maxPrice)}`);
  return parts.join(' ');
}

export function formatStockReply(items: StockItem[], query: ParsedStockQuery): string {
  const range = describeRange(query);

  if (items.length === 0) {
    return `No hay stock disponible ${range}.`;
  }

  const lines = items.map((item) => {
    const warehouse = item.warehouse ? ` · ${item.warehouse}` : '';
    return `• **${item.name}** (${item.sku}) — ${money(item.price)} · ${item.quantityAvailable} u.${warehouse}`;
  });

  const header = `**Stock disponible ${range}** (${items.length} resultado${
    items.length === 1 ? '' : 's'
  }):`;

  return [header, ...lines].join('\n');
}

export function formatSalesReply(summary: CommissionSummary): string {
  const pct = (summary.commissionRateUsed * 100)
    .toFixed(2)
    .replace(/\.?0+$/, '');

  return [
    `**Resumen de ${summary.month}** para ${summary.sellerId}:`,
    `• Ventas brutas: ${money(summary.grossSales)}`,
    `• Comisión (${pct}%): ${money(summary.commissionAmount)}`,
    `• Margen neto: ${money(summary.netMargin)}`,
  ].join('\n');
}

export interface MarginResult {
  cost: number;
  sale: number;
  profit: number;
  marginOnSalePct: number; // ganancia / venta * 100
  markupOnCostPct: number; // ganancia / costo * 100
}

export function formatMarginReply(result: MarginResult): string {
  const lines = [
    `Con costo ${money(result.cost)} y venta ${money(result.sale)}:`,
    `• Ganancia: ${money(result.profit)}`,
    `• Margen sobre venta: ${percent(result.marginOnSalePct)}`,
    `• Markup sobre costo: ${percent(result.markupOnCostPct)}`,
  ];
  if (result.profit < 0) {
    lines.push('⚠️ Estás vendiendo por debajo del costo.');
  }
  return lines.join('\n');
}

export interface ProjectionResult {
  quantity: number;
  unitPrice: number;
  commissionRate: number;
  totalRevenue: number; // cantidad * precio unitario
  commissionAmount: number; // ingreso total * tasa — lo que se lleva el vendedor
  priceSource?: string; // nombre del producto si el precio salió del stock
}

export function formatProjectionReply(result: ProjectionResult): string {
  const pct = (result.commissionRate * 100).toFixed(2).replace(/\.?0+$/, '');
  const priceNote = result.priceSource
    ? ` (precio de "${result.priceSource}" tomado del stock)`
    : '';

  return [
    `Proyección: ${result.quantity} × ${money(result.unitPrice)} = ${money(
      result.totalRevenue,
    )} en ventas${priceNote}.`,
    `Con ${pct}% de comisión, tu ganancia sería ${money(result.commissionAmount)}.`,
  ].join('\n');
}
