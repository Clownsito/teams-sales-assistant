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
const money = (value: number): string => `$${clp.format(value)}`;

export const HELP_TEXT = [
  'No entendí la consulta. Puedo ayudarte con dos cosas:',
  '• **Stock por precio** — ej. "teléfonos entre 20.000 y 50.000" o "qué hay bajo 30000".',
  '• **Tu comisión del mes** — ej. "cuánto gané este mes con 8% de comisión".',
].join('\n');

export const WELCOME_TEXT = [
  '¡Hola! Soy el asistente de ventas.',
  'Pregúntame por stock en un rango de precio, o por tu comisión del mes indicando el porcentaje.',
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
