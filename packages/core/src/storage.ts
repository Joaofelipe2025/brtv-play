/** Adapter de armazenamento chave/valor. Android: AsyncStorage. webOS: localStorage. */
export interface KeyValueAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Implementação em memória, usada em testes e como fallback. */
export class MemoryAdapter implements KeyValueAdapter {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}
