import { BadRequestException } from '@nestjs/common';
import { IntentParserService } from '../intent/intent-parser.service';
import { SalesService, CommissionSummary } from '../sales/sales.service';
import { CommissionSummaryCapability } from './commission-summary.capability';

describe('CommissionSummaryCapability', () => {
  const summary: CommissionSummary = {
    sellerId: 'seller-1',
    month: '2026-08',
    grossSales: 146970,
    commissionRateUsed: 0.08,
    commissionAmount: 11757.6,
    netMargin: 135212.4,
  };

  function makeCapability(getMonthlySummary = jest.fn().mockResolvedValue(summary)) {
    const capability = new CommissionSummaryCapability(
      new IntentParserService(),
      { getMonthlySummary } as unknown as SalesService,
    );
    return { capability, getMonthlySummary };
  }

  describe('canHandle', () => {
    it('matchea cuando se menciona un % o una palabra de ventas', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('cuánto gané este mes con 8% de comisión')).toBe(true);
      expect(capability.canHandle('cuánto vendí este mes')).toBe(true);
      expect(capability.canHandle('mi resumen del mes')).toBe(true);
    });

    it('no matchea una consulta de stock ni un saludo', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('teléfonos entre 20000 y 50000')).toBe(false);
      expect(capability.canHandle('hola qué tal')).toBe(false);
    });
  });

  describe('handle', () => {
    it('pasa la tasa parseada a SalesService y formatea el resumen', async () => {
      const { capability, getMonthlySummary } = makeCapability();

      const reply = await capability.handle('cuánto gané este mes con 8% de comisión', 'seller-1');

      expect(getMonthlySummary).toHaveBeenCalledWith('seller-1', expect.any(String), 0.08);
      expect(reply).toContain('Resumen de 2026-08');
      expect(reply).toContain('Comisión (8%)');
    });

    it('llama sin tasa cuando no se menciona el % (la resuelve SalesService)', async () => {
      const { capability, getMonthlySummary } = makeCapability();

      await capability.handle('cuánto vendí este mes', 'seller-1');

      expect(getMonthlySummary).toHaveBeenCalledWith('seller-1', expect.any(String), undefined);
    });

    it('reenvía al vendedor el mensaje de BadRequestException de SalesService', async () => {
      const getMonthlySummary = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Indica tu % de comisión, ej. "con 8%".'));
      const { capability } = makeCapability(getMonthlySummary);

      const reply = await capability.handle('mi comisión de este mes', 'seller-1');

      expect(reply).toBe('Indica tu % de comisión, ej. "con 8%".');
    });
  });
});
