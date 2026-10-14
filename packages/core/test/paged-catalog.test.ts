import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryAdapter } from '../src/storage';
import { PagedCatalogClient, catalogMatches, catalogSearchBucket, type CatalogFetch, type CatalogManifest } from '../src/paged-catalog';

const a = { id: 'm-' + 'a'.repeat(24), name: 'A Casa Azul', group: 'Drama' };
const b = { id: 'm-' + 'b'.repeat(24), name: 'A Casa Vermelha', group: 'Bloqueada' };
const manifest: CatalogManifest = { schema: 1, version: 'v2-' + 'a'.repeat(16), pageSize: 30, totals: { movies: 60, series: 0, episodes: 0 }, categories: { movies: [], series: [] } };
const base = 'https://example.org/catalog';
const response = (value: unknown, ok = true) => ({ ok, headers: { get: () => null }, text: async () => JSON.stringify(value) });
afterEach(() => vi.useRealTimers());

describe('catálogo estático paginado', () => {
  it('seleciona páginas e índice alfabéticos sem ordenar somente a janela local e aplica categoria na busca', async () => {
    const fetcher = vi.fn(async (url: string) => response(url.endsWith('/manifest.json') ? { ...manifest, orders: ['recent', 'alphabetical'] } : url.endsWith('/index.json') ? { pages: 1 } : { items: [a, b], next: null }));
    const client = new PagedCatalogClient(new MemoryAdapter(), fetcher);
    const snapshot = await client.open(base);
    await client.page(snapshot, 'movies', 'all', 0, 'alphabetical');
    expect(fetcher.mock.calls[1]?.[0]).toContain('/alphabetical/movies/all/0.json');
    const result = await client.search(snapshot, 'movies', 'casa', undefined, [], 'alphabetical', 'Drama');
    expect(result.items).toEqual([a]);
    expect(fetcher.mock.calls[2]?.[0]).toContain('/alphabetical/search/');
  });
  it('preserva alternativas válidas e rejeita fontes malformadas', async () => {
    for (const sources of [undefined, [{ url: 'https://example.org/alt.mp4', label: 'Dublado' }]]) {
      const data = { ...a, url: 'https://example.org/movie.mp4', sources };
      const client = new PagedCatalogClient(new MemoryAdapter(), async (url) => response(url.endsWith('/manifest.json') ? manifest : data));
      const s = await client.open(base);
      expect((await client.detail(s, a.id)).sources).toEqual(sources);
    }
    for (const sources of [[], [{ url: 'file:///local', label: 'Inválida' }], [{ url: 'https://example.org/a', label: '' }]]) {
      const client = new PagedCatalogClient(new MemoryAdapter(), async (url) => response(url.endsWith('/manifest.json') ? manifest : { ...a, url: 'https://example.org/movie.mp4', sources }));
      const s = await client.open(base);
      await expect(client.detail(s, a.id)).rejects.toThrow('Não foi possível');
    }
  });
  it('abre apenas o manifesto e busca a página selecionada na mesma versão', async () => {
    const fetcher = vi.fn(async (url: string) => response(url.endsWith('/manifest.json') ? manifest : { items: [a], next: 1 }));
    const client = new PagedCatalogClient(new MemoryAdapter(), fetcher);
    const snapshot = await client.open(base);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(base + '/manifest.json');
    await client.page(snapshot, 'movies', 'all', 0);
    expect(fetcher.mock.calls[1]?.[0]).toBe(`${base}/${manifest.version}/movies/all/0.json`);
    expect(fetcher.mock.calls.every(([url]) => !url.includes('.m3u'))).toBe(true);
  });
  it('compartilha pedidos simultâneos e reaproveita páginas em cache', async () => {
    const fetcher = vi.fn(async (url: string) => response(url.endsWith('/manifest.json') ? manifest : { items: [a], next: null }));
    const client = new PagedCatalogClient(new MemoryAdapter(), fetcher);
    const s = await client.open(base);
    await Promise.all([client.page(s, 'movies', 'all', 0), client.page(s, 'movies', 'all', 0)]);
    await client.page(s, 'movies', 'all', 0);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('mantém o manifesto válido após uma atualização malformada', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(response(manifest)).mockResolvedValueOnce(response({ schema: 999 }));
    const client = new PagedCatalogClient(new MemoryAdapter(), fetcher);
    await client.open(base);
    const old = await client.open(base);
    expect(old.manifest.version).toBe(manifest.version);
    expect(old.notice).toContain('último catálogo');
  });
  it('snapshot antigo continua usando sua versão após atualizar o manifesto', async () => {
    let version = manifest.version;
    const fetcher = vi.fn(async (url: string) => response(url.endsWith('/manifest.json') ? { ...manifest, version } : { items: [a], next: null }));
    const client = new PagedCatalogClient(new MemoryAdapter(), fetcher);
    const old = await client.open(base);
    version = 'v2-' + 'b'.repeat(16);
    await client.open(base);
    await client.page(old, 'movies', 'all', 0);
    expect(fetcher.mock.calls[2]?.[0]).toContain(manifest.version);
  });
  it('busca global visita páginas ainda não abertas e exclui categorias bloqueadas', async () => {
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith('/manifest.json')) return response(manifest);
      if (url.endsWith('/index.json')) return response({ pages: 2 });
      return response({ items: url.endsWith('/0.json') ? [b] : [a], next: null });
    });
    const client = new PagedCatalogClient(new MemoryAdapter(), fetcher);
    const s = await client.open(base);
    const result = await client.search(s, 'movies', 'casa', undefined, ['Bloqueada']);
    expect(result.items).toEqual([a]);
    expect(result.next).toBeNull();
    expect(fetcher.mock.calls.some(([url]) => url.includes(`/search/movies/${catalogSearchBucket('casa')}/1.json`))).toBe(true);
  });
  it('busca continua sem repetir nem perder entradas entre lotes de 30', async () => {
    const entries = Array.from({ length: 65 }, (_, i) => ({ ...a, id: 'm-' + i.toString(16).padStart(24, '0') }));
    const fetcher: CatalogFetch = async (url) => response(url.endsWith('manifest.json') ? manifest : url.endsWith('index.json') ? { pages: 1 } : { items: entries, next: null });
    const client = new PagedCatalogClient(new MemoryAdapter(), fetcher);
    const s = await client.open(base);
    const first = await client.search(s, 'movies', 'casa');
    const second = await client.search(s, 'movies', 'casa', first.next ?? undefined);
    const third = await client.search(s, 'movies', 'casa', second.next ?? undefined);
    expect([first.items.length, second.items.length, third.items.length]).toEqual([30, 30, 5]);
    expect(new Set([...first.items, ...second.items, ...third.items].map((e) => e.id)).size).toBe(65);
    expect(third.next).toBeNull();
  });
  it('normaliza acentos e busca por prefixos de palavras', () => {
    expect(catalogMatches('Ação em São Paulo', 'acao sao')).toBe(true);
    expect(catalogMatches('Casa Azul', 'cas az')).toBe(true);
    expect(catalogMatches('Casa Azul', 'asa')).toBe(false);
  });
  it('não acessa caminhos arbitrários vindos de uma rota', async () => {
    const fetcher = vi.fn(async () => response(manifest));
    const client = new PagedCatalogClient(new MemoryAdapter(), fetcher);
    const s = await client.open(base);
    await expect(client.detail(s, '../private')).rejects.toThrow('inválido');
    await expect(client.page(s, 'movies', '../private', 0)).rejects.toThrow('inválida');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('interrompe uma requisição travada e apresenta erro recuperável', async () => {
    vi.useFakeTimers();
    const client = new PagedCatalogClient(new MemoryAdapter(), (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('abort')))));
    const assertion = expect(client.open(base)).rejects.toThrow('Tente novamente'.toLowerCase());
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
  });
});
