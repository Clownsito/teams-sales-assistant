import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { HealthController } from './health.controller';

/**
 * Health check para despliegues en la nube (ADR-004). El `TypeOrmHealthIndicator`
 * usa la conexión por defecto configurada en AppModule.
 */
@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
})
export class HealthModule {}
