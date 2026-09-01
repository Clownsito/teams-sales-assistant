import { Injectable } from '@nestjs/common';
import { StockCache } from './stock-cache.interface';

interface Entry {
  value: unknown;
  expiresAt: number;
}

/**
 * Cache en memoria para desarrollo/portafolio — implementa la misma
 * interfaz StockCache que usará Redis en producción (ver ADR-001).
 * Cambiar a Redis más adelante es reemplazar esta clase por
 * RedisCacheAdapter en adapters.module.ts, sin tocar StockService.
 */
@Injectable()
export class InMemoryCacheAdapter implements StockCache {
  private readonly store = new Map<string, Entry>();

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
}
