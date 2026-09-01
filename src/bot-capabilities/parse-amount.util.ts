/**
 * Convierte un número escrito por el vendedor ("34.000", "34000", "1.234,5")
 * a `number`, con el mismo criterio que IntentParserService: el punto es
 * separador de miles y la coma es decimal.
 *
 * Devuelve `undefined` si no queda un número finito y positivo — las
 * capacidades usan eso para NO matchear cuando los montos no están claros.
 */
export function parseAmount(raw: string): number | undefined {
  const value = Number(raw.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) && value > 0 ? value : undefined;
}
