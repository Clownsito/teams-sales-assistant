import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class StockQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  maxPrice?: number;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsString()
  tenantId?: string;
}
