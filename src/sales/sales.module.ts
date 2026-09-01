import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdaptersModule } from '../adapters/adapters.module';
import { Salesperson } from '../tenants/entities/salesperson.entity';
import { SalesController } from './sales.controller';
import { SalesService } from './sales.service';

@Module({
  imports: [AdaptersModule, TypeOrmModule.forFeature([Salesperson])],
  controllers: [SalesController],
  providers: [SalesService],
  exports: [SalesService], // lo consume TeamsModule (capa de entrada del bot)
})
export class SalesModule {}
