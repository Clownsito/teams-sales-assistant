import { Injectable } from '@nestjs/common';

/**
 * Lo que el bot recuerda de UNA conversación, para poder responder
 * seguimientos como "y si lo vendo 10% más caro" (ver ADR-005). Es un
 * resumen mínimo del último cálculo, no un historial de mensajes.
 */
export interface ConversationMemory {
  lastIntent?: 'stock' | 'commission' | 'margin' | 'projection';
  lastProduct?: { name: string; price: number };
  lastUnitPrice?: number;
  lastQuantity?: number;
  lastCommissionRate?: number;
  lastMargin?: { cost: number; sale: number };
}

const TTL_MS = 30 * 60 * 1000; // 30 min sin actividad y la conversación se olvida.

interface Entry {
  memory: ConversationMemory;
  expiresAt: number;
}

/**
 * Store en memoria del proceso, con TTL por inactividad. Alcanza para
 * desarrollo/portafolio y para un solo nodo; con varias instancias esto
 * pasaría a Redis (misma idea que el cache de stock — ver ADR-001/004).
 */
@Injectable()
export class ConversationMemoryService {
  private readonly store = new Map<string, Entry>();

  get(conversationId: string): ConversationMemory {
    const entry = this.store.get(conversationId);
    if (!entry) return {};
    if (Date.now() > entry.expiresAt) {
      this.store.delete(conversationId);
      return {};
    }
    return entry.memory;
  }

  /** Mezcla el patch con lo ya recordado y renueva el TTL. */
  update(conversationId: string, patch: Partial<ConversationMemory>): void {
    const current = this.get(conversationId);
    this.store.set(conversationId, {
      memory: { ...current, ...patch },
      expiresAt: Date.now() + TTL_MS,
    });
  }

  clear(conversationId: string): void {
    this.store.delete(conversationId);
  }
}
