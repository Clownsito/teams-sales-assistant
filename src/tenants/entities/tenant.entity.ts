import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { Salesperson } from './salesperson.entity';

@Entity()
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  name!: string;

  // Tipo de ERP integrado (ej. "mock", "generic-rest", "sap") — decide qué
  // adaptador concreto usar para este tenant.
  @Column({ default: 'mock' })
  erpType!: string;

  @Column({ nullable: true })
  erpBaseUrl?: string;

  // En producción esto se guarda encriptado (KMS/Vault), nunca en texto plano.
  @Column({ nullable: true })
  erpApiKeyEncrypted?: string;

  @OneToMany(() => Salesperson, (salesperson) => salesperson.tenant)
  salespeople!: Salesperson[];
}
