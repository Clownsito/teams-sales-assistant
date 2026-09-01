import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdaptersModule } from './adapters/adapters.module';
import { StockModule } from './stock/stock.module';
import { SalesModule } from './sales/sales.module';
import { TenantsModule } from './tenants/tenants.module';
import { TeamsModule } from './teams/teams.module';
import { Tenant } from './tenants/entities/tenant.entity';
import { Salesperson } from './tenants/entities/salesperson.entity';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // TypeORM se conecta a MySQL solo para configuración de tenants/vendedores
    // y snapshots de comisión — nunca para el stock, que siempre viene del ERP.
    TypeOrmModule.forRoot({
      type: 'mysql',
      host: process.env.DB_HOST ?? 'localhost',
      port: Number(process.env.DB_PORT ?? 3306),
      username: process.env.DB_USER ?? 'teams_assistant',
      password: process.env.DB_PASSWORD ?? 'change-me',
      database: process.env.DB_NAME ?? 'teams_sales_assistant',
      entities: [Tenant, Salesperson],
      synchronize: true, // ok para desarrollo/portafolio; usar migraciones en producción
    }),
    AdaptersModule,
    TenantsModule,
    StockModule,
    SalesModule,
    TeamsModule,
  ],
})
export class AppModule {}
