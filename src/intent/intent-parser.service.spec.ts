import { IntentParserService } from './intent-parser.service';

describe('IntentParserService', () => {
  const parser = new IntentParserService();

  it('extrae un rango de precio con formato "entre X y Y"', () => {
    expect(parser.parseStockQuery('teléfonos entre 20.000 y 50.000')).toEqual({
      minPrice: 20000,
      maxPrice: 50000,
    });
  });

  it('extrae solo el máximo con "bajo X"', () => {
    expect(parser.parseStockQuery('teléfonos bajo 30000')).toEqual({ maxPrice: 30000 });
  });

  it('extrae solo el mínimo con "sobre X"', () => {
    expect(parser.parseStockQuery('teléfonos sobre 40000')).toEqual({ minPrice: 40000 });
  });

  it('devuelve vacío si no hay números reconocibles', () => {
    expect(parser.parseStockQuery('qué teléfonos tienes')).toEqual({});
  });

  it('extrae el porcentaje de comisión', () => {
    expect(parser.parseSalesQuery('cuánto gané este mes con 8% de comisión')).toEqual({
      commissionRate: 0.08,
    });
  });

  it('devuelve vacío si no se menciona comisión', () => {
    expect(parser.parseSalesQuery('cuánto vendí este mes')).toEqual({});
  });
});
