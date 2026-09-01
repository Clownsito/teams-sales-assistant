import { Module } from '@nestjs/common';
import { IntentModule } from '../intent/intent.module';
import { StockModule } from '../stock/stock.module';
import { SalesModule } from '../sales/sales.module';
import { BOT_CAPABILITIES, BotCapability } from './bot-capability.interface';
import { CapabilityRouter } from './capability-router.service';
import { StockLookupCapability } from './stock-lookup.capability';
import { CommissionSummaryCapability } from './commission-summary.capability';
import { MarginCalculatorCapability } from './margin-calculator.capability';
import { SaleProjectionCapability } from './sale-projection.capability';

/**
 * Router de capacidades del bot (ADR-003). Para agregar una capacidad nueva:
 * crear la clase que implemente BotCapability, agregarla a `providers` y a la
 * lista de `BOT_CAPABILITIES` en la posición que corresponda. Nada más cambia.
 *
 * El ORDEN de la lista es la precedencia del router: de la más específica a
 * la más amplia.
 *   1. margin-calculator  — necesita precio de costo Y de venta en la frase.
 *   2. sale-projection    — proyección hipotética ("si vendo N ... con X%").
 *   3. stock-lookup       — rango de precio.
 *   4. commission-summary — la más amplia (cualquier "%" o palabra de ventas).
 */
@Module({
  imports: [IntentModule, StockModule, SalesModule],
  providers: [
    StockLookupCapability,
    CommissionSummaryCapability,
    MarginCalculatorCapability,
    SaleProjectionCapability,
    {
      provide: BOT_CAPABILITIES,
      useFactory: (
        margin: MarginCalculatorCapability,
        projection: SaleProjectionCapability,
        stock: StockLookupCapability,
        commission: CommissionSummaryCapability,
      ): BotCapability[] => [margin, projection, stock, commission],
      inject: [
        MarginCalculatorCapability,
        SaleProjectionCapability,
        StockLookupCapability,
        CommissionSummaryCapability,
      ],
    },
    CapabilityRouter,
  ],
  exports: [CapabilityRouter],
})
export class BotCapabilitiesModule {}
