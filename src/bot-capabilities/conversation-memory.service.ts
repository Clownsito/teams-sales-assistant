import { Injectable } from '@nestjs/common';

export interface TranscriptTurn {
  role: 'user' | 'bot';
  text: string;
}

/**
 * Lo que el bot recuerda de UNA conversación (ver ADR-005):
 *  - un resumen estructurado del último cálculo (para seguimientos por reglas
 *    tipo "y si lo vendo 10% más caro"), y
 *  - un historial corto de los últimos mensajes (usuario y bot), que usa el
 *    fallback de IA para sostener una racha de preguntas abiertas relacionadas.
 */
export interface ConversationMemory {
  lastIntent?: 'stock' | 'commission' | 'margin' | 'projection';
  lastProduct?: { name: string; price: number };
  lastUnitPrice?: number;
  lastQuantity?: number;
  lastCommissionRate?: number;
  lastMargin?: { cost: number; sale: number };
  transcript?: TranscriptTurn[];
}

const TTL_MS = 30 * 60 * 1000; // 30 min sin actividad y la conversación se olvida.
const MAX_TRANSCRIPT_TURNS = 20; // hasta 10 intercambios usuario↔bot.
const MAX_TURN_CHARS = 600; // se recorta cada mensaje guardado.

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
    this.write(conversationId, { ...this.get(conversationId), ...patch });
  }

  /** Agrega un intercambio (mensaje del vendedor + respuesta del bot) al historial. */
  appendTurn(conversationId: string, userText: string, botText: string): void {
    const current = this.get(conversationId);
    const transcript = [
      ...(current.transcript ?? []),
      { role: 'user' as const, text: clip(userText) },
      { role: 'bot' as const, text: clip(botText) },
    ].slice(-MAX_TRANSCRIPT_TURNS);
    this.write(conversationId, { ...current, transcript });
  }

  getTranscript(conversationId: string): TranscriptTurn[] {
    return this.get(conversationId).transcript ?? [];
  }

  clear(conversationId: string): void {
    this.store.delete(conversationId);
  }

  private write(conversationId: string, memory: ConversationMemory): void {
    this.store.set(conversationId, { memory, expiresAt: Date.now() + TTL_MS });
  }
}

function clip(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_TURN_CHARS
    ? `${trimmed.slice(0, MAX_TURN_CHARS)}…`
    : trimmed;
}
