import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Tenant } from './tenant.entity';

@Entity()
export class Salesperson {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => Tenant, (tenant) => tenant.salespeople)
  tenant!: Tenant;

  @Column()
  teamsUserId!: string;

  @Column()
  name!: string;

  // Solo un valor por defecto — ver ADR-002: la tasa real de comisión se
  // recibe como parámetro en cada consulta y usa este valor únicamente si
  // el vendedor no la menciona.
  @Column({ type: 'decimal', precision: 5, scale: 4, nullable: true })
  defaultCommissionRate?: number;
}
