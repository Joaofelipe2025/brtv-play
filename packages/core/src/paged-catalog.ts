import type { KeyValueAdapter } from './storage';

export const PAGED_CATALOG_ID = 'public-vod-catalog';
export const SAIMO_CATALOG_ID = 'saimo-vod-catalog';
export const isPagedCatalog = (id: string | undefined): boolean => id === PAGED_CATALOG_ID || id === SAIMO_CATALOG_ID;
export interface CatalogSource { url: string; label: string }
export type CatalogKind = 'movies' | 'series';
export interface CatalogGroup { id: string; name: string; count: number; pages: number }
export interface CatalogManifest {
  schema: 1;
  version: string;
  pageSize: number;
  totals: { movies: number; series: number; episodes: number };
  categories: { movies: CatalogGroup[]; series: CatalogGroup[] };
}
export interface CatalogItem { id: string; name: string; group: string; poster?: string }
export interface CatalogEpisode { id: string; title: string; season: number; episode: number; url: string; sources?: CatalogSource[] }
export interface CatalogSeason { season: number; count: number; pages: number }
export interface CatalogDetail extends CatalogItem { url?: string; sources?: CatalogSource[]; seasons?: CatalogSeason[] }
export interface CatalogPage<T> { items: T[]; next: number | null }
export interface CatalogSearchCursor { page: number; offset: number }
export interface CatalogSnapshot { manifest: CatalogManifest; baseUrl: string; notice: string | null }
export type CatalogFetch = (url: string, init: { signal: AbortSignal }) => Promise<{
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export const catalogWords = (text: string): string[] =>
  text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
export function catalogSearchBucket(word: string): number {
  let h = 2166136261;
  for (const c of word.slice(0, 3)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 256;
}
export function catalogMatches(name: string, query: string): boolean {
  const tokens = catalogWords(name);
  return catalogWords(query).every((q) => tokens.some((w) => w.startsWith(q)));
}
const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const count = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0 && v.length < 4096;
const media = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\/[^\s]+$/i.test(v) && v.length < 8192;
const id = (v: unknown): v is string => typeof v === 'string' && /^[mse]-[a-f0-9]{24}$/.test(v);
const group = (v: unknown): v is CatalogGroup => object(v) && typeof v.id === 'string' && /^g-[a-f0-9]{24}$/.test(v.id) && str(v.name) && count(v.count) && count(v.pages);
export function isCatalogManifest(v: unknown): v is CatalogManifest {
  return object(v) && v.schema === 1 && typeof v.version === 'string' && /^v\d+-[a-f0-9]{16}$/.test(v.version)
    && v.pageSize === 30 && object(v.totals) && count(v.totals.movies) && count(v.totals.series) && count(v.totals.episodes)
    && object(v.categories) && ['movies', 'series'].every((k) => {
      const groups = (v.categories as Record<string, unknown>)[k];
      return Array.isArray(groups) && groups.length <= 2000 && groups.every(group);
    });
}
const item = (v: unknown): v is CatalogItem => object(v) && id(v.id) && str(v.name) && str(v.group) && (v.poster === undefined || media(v.poster));
const season = (v: unknown): v is CatalogSeason => object(v) && count(v.season) && count(v.count) && count(v.pages);
const sources = (v: unknown): boolean => v === undefined || (Array.isArray(v) && v.length > 0 && v.length <= 128 && v.every((s) => object(s) && media(s.url) && str(s.label)));
const detail = (v: unknown): v is CatalogDetail => item(v) && object(v) && sources(v.sources)
  && ((media(v.url) && v.id.startsWith('m-')) || (v.id.startsWith('s-') && Array.isArray(v.seasons) && v.seasons.length <= 1000 && v.seasons.every(season)));
const episode = (v: unknown): v is CatalogEpisode => object(v) && id(v.id) && str(v.title) && count(v.season) && count(v.episode) && media(v.url) && sources(v.sources);
const pageOf = <T>(guard: (v: unknown) => v is T) => (v: unknown): v is CatalogPage<T> =>
  object(v) && Array.isArray(v.items) && v.items.length <= 100 && v.items.every(guard) && (v.next === null || count(v.next));
const searchIndex = (v: unknown): v is { pages: number } => object(v) && count(v.pages);

const CACHE_KEY = 'brtv.paged-catalog.cache.v1';
const MAX_RESPONSE = 512_000;
const CACHE_BUDGET = 900_000;
const DAY = 86_400_000;
interface CacheEntry { url: string; text: string; at: number }

/** Catálogo estático: nenhuma chamada deste cliente aponta para o M3U original. */
export class PagedCatalogClient {
  private cache = new Map<string, CacheEntry>();
  private pending = new Map<string, Promise<{ value: unknown; stale: boolean }>>();
  private hydrated: Promise<void> | null = null;
  private saving: Promise<void> = Promise.resolve();
  constructor(
    private readonly storage: KeyValueAdapter,
    private readonly fetchFn: CatalogFetch = (url, init) => fetch(url, init),
    private readonly now: () => number = Date.now,
  ) {}

  private hydrate(): Promise<void> {
    if (!this.hydrated) this.hydrated = (async () => {
      try {
        const raw = await this.storage.get(CACHE_KEY);
        if (!raw || raw.length * 3 > CACHE_BUDGET) return;
        const entries: unknown = JSON.parse(raw);
        if (!Array.isArray(entries)) return;
        for (const e of entries) {
          if (object(e) && media(e.url) && typeof e.text === 'string' && typeof e.at === 'number' && this.now() - e.at < 7 * DAY) {
            this.cache.set(e.url, { url: e.url, text: e.text, at: e.at });
          }
        }
      } catch { /* Cache é opcional. */ }
    })();
    return this.hydrated;
  }

  private save(entry: CacheEntry): void {
    this.cache.delete(entry.url); this.cache.set(entry.url, entry);
    let serialized = JSON.stringify([...this.cache.values()]);
    while (serialized.length * 3 > CACHE_BUDGET && this.cache.size) {
      const evict = [...this.cache.keys()].find((url) => !url.endsWith('/manifest.json')) ?? this.cache.keys().next().value as string;
      this.cache.delete(evict);
      serialized = JSON.stringify([...this.cache.values()]);
    }
    // Serializa gravações para uma resposta antiga não sobrescrever o cache mais recente.
    this.saving = this.saving.catch(() => undefined).then(() => this.storage.set(CACHE_KEY, serialized)).catch(() => undefined);
  }

  private async read<T>(url: string, guard: (v: unknown) => v is T, fresh = false): Promise<{ value: T; stale: boolean }> {
    await this.hydrate();
    const cached = this.cache.get(url);
    const parse = (text: string): T => {
      const value: unknown = JSON.parse(text);
      if (!guard(value)) throw new Error('Catálogo incompatível ou inválido.');
      return value;
    };
    if (!fresh && cached && this.now() - cached.at < DAY) {
      try {
        const value = parse(cached.text);
        this.cache.delete(url); this.cache.set(url, cached);
        return { value, stale: false };
      } catch { this.cache.delete(url); }
    }
    let request = this.pending.get(url);
    if (!request) {
      request = (async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15_000);
        try {
          const response = await this.fetchFn(url, { signal: controller.signal });
          if (!response.ok) throw new Error('Página indisponível.');
          if (Number(response.headers.get('content-length')) > MAX_RESPONSE) throw new Error('Página muito grande.');
          const text = await response.text();
          if (text.length > MAX_RESPONSE) throw new Error('Página muito grande.');
          const value = parse(text);
          this.save({ url, text, at: this.now() });
          return { value, stale: false };
        } catch {
          if (cached && this.now() - cached.at < 7 * DAY) {
            try { return { value: parse(cached.text), stale: true }; } catch { /* inválido */ }
          }
          throw new Error('Não foi possível carregar o catálogo. Verifique a conexão ou tente novamente.');
        } finally { clearTimeout(timer); }
      })().finally(() => { this.pending.delete(url); });
      this.pending.set(url, request);
    }
    const result = await request;
    if (!guard(result.value)) throw new Error('Catálogo incompatível.');
    return { value: result.value, stale: result.stale };
  }

  async open(base: string): Promise<CatalogSnapshot> {
    const baseUrl = base.replace(/\/+$/, '');
    if (!/^https:\/\/[^\s?#]+$/.test(baseUrl)) throw new Error('Configure um endereço HTTPS para o catálogo.');
    const result = await this.read(`${baseUrl}/manifest.json`, isCatalogManifest, true);
    return { baseUrl, manifest: result.value, notice: result.stale ? 'Sem atualização: usando o último catálogo salvo. Vídeos exigem internet.' : null };
  }
  private url(s: CatalogSnapshot, path: string): string {
    if (!/^[a-zA-Z0-9/_.-]+$/.test(path) || path.includes('..')) throw new Error('Caminho de catálogo inválido.');
    return `${s.baseUrl}/${s.manifest.version}/${path}`;
  }
  async page(s: CatalogSnapshot, kind: CatalogKind, category: string, number: number): Promise<CatalogPage<CatalogItem>> {
    if (category !== 'all' && !s.manifest.categories[kind].some((g) => g.id === category)) throw new Error('Categoria inválida.');
    if (!count(number)) throw new Error('Página inválida.');
    const total = category === 'all' ? s.manifest.totals[kind] : s.manifest.categories[kind].find((g) => g.id === category)?.count ?? 0;
    if (number * 30 >= total) return { items: [], next: null };
    return (await this.read(this.url(s, `${kind}/${category}/${number}.json`), pageOf(item))).value;
  }
  async detail(s: CatalogSnapshot, itemId: string): Promise<CatalogDetail> {
    if (!id(itemId)) throw new Error('Título inválido.');
    const result = (await this.read(this.url(s, `items/${itemId}.json`), detail)).value;
    if (result.id !== itemId) throw new Error('Título incompatível.');
    return result;
  }
  async episodes(s: CatalogSnapshot, seriesId: string, seasonNo: number, number: number): Promise<CatalogPage<CatalogEpisode>> {
    if (!id(seriesId) || !count(seasonNo) || !count(number)) throw new Error('Temporada inválida.');
    return (await this.read(this.url(s, `episodes/${seriesId}/${seasonNo}/${number}.json`), pageOf(episode))).value;
  }

  /** Busca global por prefixos de palavras; examina no máximo seis páginas por rodada. */
  async search(s: CatalogSnapshot, kind: CatalogKind, query: string, cursor: CatalogSearchCursor = { page: 0, offset: 0 }, excludedGroups: readonly string[] = []): Promise<{ items: CatalogItem[]; next: CatalogSearchCursor | null }> {
    const tokens = catalogWords(query);
    const longest = [...tokens].sort((a, b) => b.length - a.length)[0];
    if (!longest || longest.length < 3) return { items: [], next: null };
    const bucket = catalogSearchBucket(longest);
    const root = `search/${kind}/${bucket}`;
    const index = (await this.read(this.url(s, `${root}/index.json`), searchIndex)).value;
    const items: CatalogItem[] = [];
    let page = cursor.page; let offset = cursor.offset;
    let scanned = 0;
    while (page < index.pages && scanned < 6) {
      const result = (await this.read(this.url(s, `${root}/${page}.json`), pageOf(item))).value;
      for (let i = offset; i < result.items.length; i++) {
        const entry = result.items[i];
        if (entry && !excludedGroups.includes(entry.group) && catalogMatches(entry.name, query)) items.push(entry);
        if (items.length === 30) {
          const next = i + 1 < result.items.length ? { page, offset: i + 1 } : page + 1 < index.pages ? { page: page + 1, offset: 0 } : null;
          return { items, next };
        }
      }
      page++; offset = 0; scanned++;
    }
    return { items, next: page < index.pages ? { page, offset } : null };
  }
}
