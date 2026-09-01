import { IsISO8601, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class SalesQueryDto {
  @IsOptional()
  @IsISO8601()
  month?: string; // formato "2026-08"

  // La comisión NUNCA es fija en el sistema (ADR-002): si no viene aquí,
  // se usa el defaultCommissionRate del vendedor, y si tampoco existe, se
  // rechaza la consulta pidiendo que se especifique.
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  commissionRate?: number;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
