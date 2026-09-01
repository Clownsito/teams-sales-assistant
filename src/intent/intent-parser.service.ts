import { Injectable } from '@nestjs/common';

export interface ParsedStockQuery {
  minPrice?: number;
  maxPrice?: number;
}

export interface ParsedSalesQuery {
  commissionRate?: number; // ej. 0.08 para 8%
}

/**
 * Parser simple basado en reglas (no LLM) — ver ADR-001: para preguntas
 * estructuradas como rango de precio o % de comisión, esto es más barato
 * y predecible que pasar por un modelo de lenguaje. Si más adelante se
 * necesita lenguaje más libre, este es el punto a reemplazar.
 */
@Injectable()
export class IntentParserService {
  /** Extrae un rango de precio de textos como "entre 20000 y 50000" o "bajo 50000". */
  parseStockQuery(text: string): ParsedStockQuery {
    const normalized = text.replace(/\./g, '').replace(/,/g, '.').toLowerCase();

    const rangeMatch = normalized.match(/(\d+(?:\.\d+)?)\s*(?:-|y|a)\s*(\d+(?:\.\d+)?)/);
    if (rangeMatch) {
      const [, min, max] = rangeMatch;
      return { minPrice: Number(min), maxPrice: Number(max) };
    }

    const maxOnlyMatch = normalized.match(/(?:bajo|menos de|hasta)\s*(\d+(?:\.\d+)?)/);
    if (maxOnlyMatch) {
      return { maxPrice: Number(maxOnlyMatch[1]) };
    }

    const minOnlyMatch = normalized.match(/(?:sobre|más de|desde)\s*(\d+(?:\.\d+)?)/);
    if (minOnlyMatch) {
      return { minPrice: Number(minOnlyMatch[1]) };
    }

    return {};
  }

  /** Extrae un porcentaje de comisión de textos como "con 8% de comisión". */
  parseSalesQuery(text: string): ParsedSalesQuery {
    const percentMatch = text.match(/(\d+(?:[.,]\d+)?)\s*%/);
    if (!percentMatch) return {};
    const value = Number(percentMatch[1].replace(',', '.'));
    return { commissionRate: value / 100 };
  }
}
