import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename, rm } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const PAGE_SIZE = 30;
const SEARCH_SIZE = 100;
export const words = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
export function searchBucket(word) {
  let h = 2166136261;
  for (const c of word.slice(0, 3)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 256;
}
const idOf = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
const httpUrl = (value) => {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) ? u.href : undefined; } catch { return undefined; }
};
function infoLine(line) {
  let quoted = false;
  let split = -1;
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted;
    if (line[i] === ',' && !quoted) { split = i; break; }
  }
  if (split < 0) return null;
  const attrs = Object.fromEntries([...line.slice(0, split).matchAll(/([\w-]+)="([^"]*)"/g)].map((m) => [m[1], m[2]]));
  return { name: line.slice(split + 1).trim() || attrs['tvg-name'], group: attrs['group-title'] || 'Sem categoria', poster: httpUrl(attrs['tvg-logo']), tvgId: attrs['tvg-id'] || '' };
}
const chunks = (array, size) => Array.from({ length: Math.ceil(array.length / size) }, (_, i) => array.slice(i * size, (i + 1) * size));
const compare = (a, b) => a.name.localeCompare(b.name, 'pt-BR') || a.id.localeCompare(b.id);

/** Lê linha a linha no computador; só os registros estruturados ficam na memória do preparador. */
export async function buildCatalog(input, output) {
  const movies = new Map();
  const series = new Map();
  const report = { entries: 0, invalid: 0, duplicates: 0, ambiguousSeriesPosters: 0, examples: [] };
  const hash = createHash('sha256').update(await readFile(new URL(import.meta.url)));
  const stream = createReadStream(input);
  stream.on('data', (chunk) => hash.update(chunk));
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  let pending = null;
  let lineNo = 0;
  let header = false;
  const reject = (reason) => {
    report.invalid++;
    if (report.examples.length < 30) report.examples.push({ line: lineNo, reason });
  };
  for await (const raw of lines) {
    lineNo++;
    const line = raw.trim();
    if (!line) continue;
    if (!header) { if (!line.startsWith('#EXTM3U')) throw new Error('Cabeçalho M3U inválido.'); header = true; continue; }
    if (line.startsWith('#EXTINF:')) {
      if (pending) reject('Entrada sem URL');
      pending = infoLine(line); report.entries++;
      if (!pending?.name) { reject('Nome inválido'); pending = null; }
      continue;
    }
    if (line.startsWith('#')) continue;
    if (!pending) continue;
    const info = pending; pending = null;
    const url = httpUrl(line);
    if (!url) { reject('URL não HTTP(S)'); continue; }
    const episode = /^(.*?)[\s._-]*S(\d{1,3})\s*E(\d{1,4})\b(.*)$/i.exec(info.name);
    const seriesGroup = /^\s*s[ée]ries\b/i.test(info.group);
    if (seriesGroup && !episode) { reject('Série sem temporada/episódio identificável'); continue; }
    if (episode) {
      const name = episode[1].trim();
      if (!name) { reject('Série sem título'); continue; }
      const artwork = info.poster ? new URL(info.poster).pathname.split('/').pop() : '';
      const seriesId = 's-' + idOf(info.group, name.normalize('NFC').toLowerCase().replace(/\s+/g, ' '), artwork);
      let item = series.get(seriesId);
      if (!item) {
        item = { id: seriesId, name, group: info.group, poster: info.poster, seasons: new Map() };
        series.set(seriesId, item);
      } else if (info.poster && item.poster && item.poster !== info.poster) report.ambiguousSeriesPosters++;
      const season = Number(episode[2]);
      const number = Number(episode[3]);
      const episodes = item.seasons.get(season) ?? new Map();
      // Mantém edições diferentes do mesmo episódio; só remove duplicatas da mesma mídia.
      const id = 'e-' + idOf(seriesId, season, number, info.tvgId || new URL(url).pathname.split('/').pop());
      if (episodes.has(id)) { report.duplicates++; continue; }
      episodes.set(id, { id, title: episode[4].replace(/^[\s._:-]+/, '') || `Episódio ${number}`, season, episode: number, url });
      item.seasons.set(season, episodes);
    } else {
      // Query strings transitórias não mudam os IDs. Ano/qualidade no título e categoria são preservados.
      const id = 'm-' + idOf(info.group, words(info.name).join(' '), info.tvgId || new URL(url).pathname.split('/').pop());
      if (movies.has(id)) { report.duplicates++; continue; }
      movies.set(id, { id, name: info.name, group: info.group, poster: info.poster, url });
    }
  }
  if (pending) reject('Entrada sem URL');
  if (!header || movies.size + series.size === 0) throw new Error('Catálogo vazio ou inválido.');
  const version = 'v2-' + hash.digest('hex').slice(0, 16);
  return writeCatalog({ movies, series, report, version }, output);
}

/** Emissor compartilhado; as listagens nunca carregam URLs de reprodução. */
export async function writeCatalog({ movies, series, report, version }, output) {
  const root = resolve(output);
  const stage = resolve(root, '.stage-' + version);
  await rm(stage, { recursive: true, force: true });
  await mkdir(stage, { recursive: true });
  let fileCount = 0; let totalBytes = 0; let maxPageBytes = 0; let firstPageBytes = 0;
  async function emit(path, value) {
    const target = resolve(stage, path); await mkdir(dirname(target), { recursive: true });
    const body = JSON.stringify(value);
    const bytes = Buffer.byteLength(body);
    if (bytes > 512_000) throw new Error(`Página excede 512 KB: ${path}`);
    await writeFile(target, body);
    fileCount++; totalBytes += bytes; maxPageBytes = Math.max(maxPageBytes, bytes);
    if (path === 'movies/all/0.json') firstPageBytes = bytes;
  }
  const summaries = { movies: [], series: [] };
  for (const movie of movies.values()) {
    const { url, sources, ...summary } = movie;
    summaries.movies.push(summary);
    await emit(`items/${movie.id}.json`, { ...summary, url, ...(sources ? { sources } : {}) });
  }
  let episodeCount = 0;
  for (const item of series.values()) {
    const { seasons, ...summary } = item;
    summaries.series.push(summary);
    const seasonList = [];
    for (const [season, data] of [...seasons].sort((a, b) => a[0] - b[0])) {
      const episodes = [...data.values()].sort((a, b) => a.episode - b.episode);
      const pages = chunks(episodes, PAGE_SIZE);
      episodeCount += episodes.length;
      for (let i = 0; i < pages.length; i++) await emit(`episodes/${item.id}/${season}/${i}.json`, { items: pages[i], next: i + 1 < pages.length ? i + 1 : null });
      seasonList.push({ season, count: episodes.length, pages: pages.length });
    }
    await emit(`items/${item.id}.json`, { ...summary, seasons: seasonList });
  }
  const categories = { movies: [], series: [] };
  const totals = { movies: movies.size, series: series.size, episodes: episodeCount };
  for (const kind of ['movies', 'series']) {
    summaries[kind].sort(compare);
    const groups = new Map([['all', summaries[kind]]]);
    for (const item of summaries[kind]) {
      const groupId = 'g-' + idOf(item.group);
      const list = groups.get(groupId) ?? [];
      list.push(item); groups.set(groupId, list);
    }
    for (const [groupId, items] of groups) {
      const pages = chunks(items, PAGE_SIZE);
      if (groupId !== 'all') categories[kind].push({ id: groupId, name: items[0].group, count: items.length, pages: pages.length });
      for (let i = 0; i < pages.length; i++) await emit(`${kind}/${groupId}/${i}.json`, { items: pages[i], next: i + 1 < pages.length ? i + 1 : null });
    }
    const buckets = Array.from({ length: 256 }, () => []);
    for (const item of summaries[kind]) {
      const keys = new Set(words(item.name).filter((w) => w.length >= 3).map(searchBucket));
      for (const key of keys) buckets[key].push(item);
    }
    for (let key = 0; key < buckets.length; key++) {
      const pages = chunks(buckets[key], SEARCH_SIZE);
      await emit(`search/${kind}/${key}/index.json`, { pages: pages.length });
      for (let i = 0; i < pages.length; i++) await emit(`search/${kind}/${key}/${i}.json`, { items: pages[i], next: i + 1 < pages.length ? i + 1 : null });
    }
  }
  const manifest = { schema: 1, version, pageSize: PAGE_SIZE, totals, categories };
  await emit('manifest.json', manifest);
  const finalDir = resolve(root, version);
  // Versões publicadas são imutáveis. Um rebuild do mesmo input reutiliza os mesmos arquivos.
  await mkdir(root, { recursive: true });
  try { await rename(stage, finalDir); } catch (error) {
    if (!['EEXIST', 'ENOTEMPTY'].includes(error.code)) throw error;
    const existing = JSON.parse(await readFile(resolve(finalDir, 'manifest.json'), 'utf8'));
    if (existing.version !== version) throw error;
    await rm(stage, { recursive: true, force: true });
  }
  // O ponteiro só muda depois de todos os arquivos da versão estarem prontos.
  await writeFile(resolve(root, 'manifest.next.json'), JSON.stringify(manifest));
  await rename(resolve(root, 'manifest.next.json'), resolve(root, 'manifest.json'));
  const result = { ...report, ...totals, version, fileCount, totalBytes, maxPageBytes, firstPageBytes, manifestBytes: Buffer.byteLength(JSON.stringify(manifest)) };
  await writeFile(resolve(root, 'build-report.json'), JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args[args.indexOf(name) + 1];
  const output = args.includes('--output') ? flag('--output') : 'catalog-output';
  let input = args.includes('--input') ? flag('--input') : null;
  let downloaded = false;
  if (!input) {
    const config = JSON.parse(await readFile(new URL('../catalog.config.json', import.meta.url), 'utf8'));
    const response = await fetch(config.sourceUrl, { signal: AbortSignal.timeout(180_000) });
    if (!response.ok || !response.body) throw new Error('Não foi possível baixar a fonte do catálogo.');
    await mkdir(output, { recursive: true });
    input = resolve(output, '.source.m3u8'); downloaded = true;
    await pipeline(Readable.fromWeb(response.body), createWriteStream(input));
  }
  try { console.log(JSON.stringify(await buildCatalog(input, output), null, 2)); }
  finally { if (downloaded) await rm(input, { force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Falha ao preparar catálogo; nenhuma publicação foi realizada.'); process.exitCode = 1; });
}
