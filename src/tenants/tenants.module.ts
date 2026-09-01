import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from './entities/tenant.entity';
import { Salesperson } from './entities/salesperson.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Tenant, Salesperson])],
  exports: [TypeOrmModule],
})
export class TenantsModule {}
