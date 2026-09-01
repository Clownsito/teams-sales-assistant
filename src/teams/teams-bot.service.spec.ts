import { BadRequestException } from '@nestjs/common';
import { IntentParserService } from '../intent/intent-parser.service';
import { StockService } from '../stock/stock.service';
import { SalesService } from '../sales/sales.service';
import { CommissionSummary } from '../sales/sales.service';
import { StockItem } from '../adapters/interfaces/inventory-adapter.interface';
import { TeamsBotService } from './teams-bot.service';

describe('TeamsBotService (ruteo de intención)', () => {
  const stockItems: StockItem[] = [
    { sku: 'PH-001', name: 'Galaxy A15', category: 'telefono', price: 21990, quantityAvailable: 12 },
    { sku: 'PH-003', name: 'Moto G34', category: 'telefono', price: 34990, quantityAvailable: 8 },
  ];

  function makeBot(overrides: {
    queryStock?: jest.Mock;
    getMonthlySummary?: jest.Mock;
  } = {}) {
    const queryStock = overrides.queryStock ?? jest.fn().mockResolvedValue(stockItems);
    const getMonthlySummary =
      overrides.getMonthlySummary ??
      jest.fn().mockResolvedValue({
        sellerId: 'seller-1',
        month: '2026-08',
        grossSales: 146970,
        commissionRateUsed: 0.08,
        commissionAmount: 11757.6,
        netMargin: 135212.4,
      } as CommissionSummary);

    const bot = new TeamsBotService(
      new IntentParserService(),
      { queryStock } as unknown as StockService,
      { getMonthlySummary } as unknown as SalesService,
    );

    return { bot, queryStock, getMonthlySummary };
  }

  it('rutea una pregunta con rango de precio a StockService y formatea la lista', async () => {
    const { bot, queryStock, getMonthlySummary } = makeBot();

    const reply = await bot.buildReply('teléfonos entre 20.000 y 50.000', 'seller-1');

    expect(queryStock).toHaveBeenCalledWith('default', { minPrice: 20000, maxPrice: 50000 });
    expect(getMonthlySummary).not.toHaveBeenCalled();
    expect(reply).toContain('Galaxy A15');
    expect(reply).toContain('2 resultados');
  });

  it('rutea una pregunta con % de comisión a SalesService y pasa la tasa parseada', async () => {
    const { bot, getMonthlySummary } = makeBot();

    const reply = await bot.buildReply('cuánto gané este mes con 8% de comisión', 'seller-1');

    expect(getMonthlySummary).toHaveBeenCalledWith('seller-1', expect.any(String), 0.08);
    expect(reply).toContain('Resumen de 2026-08');
    expect(reply).toContain('Comisión (8%)');
  });

  it('rutea a SalesService por palabra clave aunque no se mencione el %', async () => {
    const { bot, getMonthlySummary } = makeBot();

    await bot.buildReply('cuánto vendí este mes', 'seller-1');

    expect(getMonthlySummary).toHaveBeenCalledWith('seller-1', expect.any(String), undefined);
  });

  it('reenvía el mensaje de BadRequestException de SalesService al vendedor', async () => {
    const getMonthlySummary = jest
      .fn()
      .mockRejectedValue(new BadRequestException('Indica tu % de comisión, ej. "con 8%".'));
    const { bot } = makeBot({ getMonthlySummary });

    const reply = await bot.buildReply('mi comisión de este mes', 'seller-1');

    expect(reply).toBe('Indica tu % de comisión, ej. "con 8%".');
  });

  it('pide reformular cuando no reconoce la intención', async () => {
    const { bot, queryStock, getMonthlySummary } = makeBot();

    const reply = await bot.buildReply('hola, qué tal', 'seller-1');

    expect(queryStock).not.toHaveBeenCalled();
    expect(getMonthlySummary).not.toHaveBeenCalled();
    expect(reply).toContain('No entendí');
  });
});
