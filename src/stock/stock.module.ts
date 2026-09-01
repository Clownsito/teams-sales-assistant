import { Module } from '@nestjs/common';
import { AdaptersModule } from '../adapters/adapters.module';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  imports: [AdaptersModule],
  controllers: [StockController],
  providers: [StockService],
  exports: [StockService], // lo consume TeamsModule (capa de entrada del bot)
})
export class StockModule {}
