import { BadRequestException } from '@nestjs/common';
import { IntentParserService } from '../intent/intent-parser.service';
import { SalesService, CommissionSummary } from '../sales/sales.service';
import { CapabilityContext } from './bot-capability.interface';
import { ConversationMemoryService } from './conversation-memory.service';
import { CommissionSummaryCapability } from './commission-summary.capability';

const CTX: CapabilityContext = { sellerId: 'seller-1', conversationId: 'c1' };

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
    const memory = new ConversationMemoryService();
    const capability = new CommissionSummaryCapability(
      new IntentParserService(),
      { getMonthlySummary } as unknown as SalesService,
      memory,
    );
    return { capability, getMonthlySummary, memory };
  }

  describe('canHandle', () => {
    it('matchea cuando se menciona un % o una palabra de ventas', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('cuánto gané este mes con 8% de comisión', CTX)).toBe(true);
      expect(capability.canHandle('cuánto vendí este mes', CTX)).toBe(true);
      expect(capability.canHandle('mi resumen del mes', CTX)).toBe(true);
    });

    it('no matchea una consulta de stock ni un saludo', () => {
      const { capability } = makeCapability();
      expect(capability.canHandle('teléfonos entre 20000 y 50000', CTX)).toBe(false);
      expect(capability.canHandle('hola qué tal', CTX)).toBe(false);
    });
  });

  describe('handle', () => {
    it('pasa la tasa parseada a SalesService y formatea el resumen', async () => {
      const { capability, getMonthlySummary } = makeCapability();

      const reply = await capability.handle('cuánto gané este mes con 8% de comisión', CTX);

      expect(getMonthlySummary).toHaveBeenCalledWith('seller-1', expect.any(String), 0.08);
      expect(reply).toContain('Resumen de 2026-08');
      expect(reply).toContain('Comisión (8%)');
    });

    it('llama sin tasa cuando no se menciona el % (la resuelve SalesService)', async () => {
      const { capability, getMonthlySummary } = makeCapability();

      await capability.handle('cuánto vendí este mes', CTX);

      expect(getMonthlySummary).toHaveBeenCalledWith('seller-1', expect.any(String), undefined);
    });

    it('reenvía al vendedor el mensaje de BadRequestException de SalesService', async () => {
      const getMonthlySummary = jest
        .fn()
        .mockRejectedValue(new BadRequestException('Indica tu % de comisión, ej. "con 8%".'));
      const { capability } = makeCapability(getMonthlySummary);

      const reply = await capability.handle('mi comisión de este mes', CTX);

      expect(reply).toBe('Indica tu % de comisión, ej. "con 8%".');
    });
  });
});
