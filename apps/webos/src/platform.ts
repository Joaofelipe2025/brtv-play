import {
  createAppStore,
  MemoryAdapter,
  type KeyValueAdapter,
} from '@brtv/core';

/** Adapter sobre localStorage. Qualquer falha cai para memória (ex.: modo privado). */
export class LocalStorageAdapter implements KeyValueAdapter {
  private readonly fallback = new MemoryAdapter();

  async get(key: string): Promise<string | null> {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return this.fallback.get(key);
    }
  }

  async set(key: string, value: string): Promise<void> {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      await this.fallback.set(key, value);
    }
  }

  async remove(key: string): Promise<void> {
    try {
      window.localStorage.removeItem(key);
    } catch {
      await this.fallback.remove(key);
    }
  }
}

export const adapter = new LocalStorageAdapter();
export const store = createAppStore(adapter);

export function hydrateStore(): Promise<void> {
  return store.hydrate();
}

export type StreamFormat = 'hls' | 'ts';

export interface Preferences {
  streamFormat: StreamFormat;
}

const PREFS_KEY = 'brtv.prefs.v1';
const defaultPrefs: Preferences = { streamFormat: 'hls' };

export async function loadPreferences(): Promise<Preferences> {
  const raw = await adapter.get(PREFS_KEY);
  if (!raw) return defaultPrefs;
  try {
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return {
      streamFormat: parsed.streamFormat === 'ts' ? 'ts' : 'hls',
    };
  } catch {
    return defaultPrefs;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await adapter.set(PREFS_KEY, JSON.stringify(prefs));
}
