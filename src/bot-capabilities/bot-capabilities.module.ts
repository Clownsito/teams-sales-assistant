import { Module } from '@nestjs/common';
import { IntentModule } from '../intent/intent.module';
import { StockModule } from '../stock/stock.module';
import { SalesModule } from '../sales/sales.module';
import { BOT_CAPABILITIES, BotCapability } from './bot-capability.interface';
import { CapabilityRouter } from './capability-router.service';
import { ConversationMemoryService } from './conversation-memory.service';
import { StockLookupCapability } from './stock-lookup.capability';
import { CommissionSummaryCapability } from './commission-summary.capability';
import { MarginCalculatorCapability } from './margin-calculator.capability';
import { SaleProjectionCapability } from './sale-projection.capability';
import { FollowUpCapability } from './follow-up.capability';
import { AiFallbackCapability } from './ai-fallback.capability';

/**
 * Router de capacidades del bot (ADR-003 + ADR-005). Para agregar una
 * capacidad: crear la clase que implemente BotCapability, agregarla a
 * `providers` y a la lista de `BOT_CAPABILITIES` en la posición que
 * corresponda. Nada más cambia.
 *
 * El ORDEN de la lista es la precedencia del router: de la más específica a
 * la más amplia.
 *   1. follow-up          — seguimiento del último cálculo ("y si...") — necesita memoria.
 *   2. margin-calculator  — precio de costo Y de venta en la frase.
 *   3. sale-projection    — proyección hipotética ("si vendo N ... con X%").
 *   4. stock-lookup       — rango de precio.
 *   5. commission-summary — cualquier "%" o palabra de ventas.
 *   6. ai-fallback        — catch-all vía Claude (solo si hay ANTHROPIC_API_KEY).
 */
@Module({
  imports: [IntentModule, StockModule, SalesModule],
  providers: [
    ConversationMemoryService,
    StockLookupCapability,
    CommissionSummaryCapability,
    MarginCalculatorCapability,
    SaleProjectionCapability,
    FollowUpCapability,
    AiFallbackCapability,
    {
      provide: BOT_CAPABILITIES,
      useFactory: (
        followUp: FollowUpCapability,
        margin: MarginCalculatorCapability,
        projection: SaleProjectionCapability,
        stock: StockLookupCapability,
        commission: CommissionSummaryCapability,
        aiFallback: AiFallbackCapability,
      ): BotCapability[] => [followUp, margin, projection, stock, commission, aiFallback],
      inject: [
        FollowUpCapability,
        MarginCalculatorCapability,
        SaleProjectionCapability,
        StockLookupCapability,
        CommissionSummaryCapability,
        AiFallbackCapability,
      ],
    },
    CapabilityRouter,
  ],
  exports: [CapabilityRouter],
})
export class BotCapabilitiesModule {}
