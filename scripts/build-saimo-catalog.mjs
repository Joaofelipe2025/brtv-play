import { createHash } from 'node:crypto';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { writeCatalog } from './build-vod-catalog.mjs';

const exec = promisify(execFile);
const identity = (...parts) => createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 24);
const normalized = (name) => name.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const media = (value) => {
  try {
    const u = new URL(value);
    return /^https?:$/.test(u.protocol) && !/\s/.test(value) && value.length < 8192 ? u.href : null;
  } catch { return null; }
};

/** Lê somente dados de um snapshot: nenhum código do fornecedor é executado. */
export async function buildSaimoCatalog(source, output) {
  const hash = createHash('sha256');
  hash.update(await readFile(new URL(import.meta.url)));
  hash.update(await readFile(new URL('./build-vod-catalog.mjs', import.meta.url)));
  const read = async (name) => {
    const text = await readFile(join(source, name), 'utf8');
    hash.update(name).update(text);
    return text.split(/\r?\n/);
  };
  const bases = new Map();
  const letters = [];
  for (const line of await read('vod/indice.txt')) {
    const base = /^base:\s*(\d+)\s+(https?:\/\/\S+)\s*$/.exec(line);
    if (base) { bases.set(Number(base[1]), base[2]); continue; }
    const fields = line.split('\t');
    if (/^[A-Z#]$/.test(fields[0]) && fields.length >= 3) letters.push(fields[0]);
  }
  if (!bases.size || !letters.length) throw new Error('Índice Saimo inválido');
  const deadUrls = new Set(); const deadHosts = new Set(['desativado.invalid']);
  for (const raw of await read('fontes-mortas.txt')) {
    const line = raw.trim();
    if (line.startsWith('servidor:')) deadHosts.add(line.slice(9).trim().toLowerCase());
    else { const url = media(line); if (url) deadUrls.add(url); }
  }
  const posters = new Map(); let posterBase = '';
  for (const line of await read('vod/fichas.txt')) {
    if (line.startsWith('capa:')) { posterBase = line.slice(5).trim(); continue; }
    const [kind, title, , poster] = line.split('\t');
    const url = poster && media(posterBase + poster);
    if (url) posters.set(`${kind}|${title}`, url);
  }
  const report = { source: 'gabrielsaimo/SaimoPlayer', rejectedSources: 0, duplicateSources: 0, sources: 0, multiSourceMovies: 0 };
  const expand = (value) => {
    if (/^https?:\/\//.test(value)) return media(value);
    const match = /^(\d+):(.+)$/.exec(value);
    if (!match || !bases.has(Number(match[1]))) return null;
    return media(bases.get(Number(match[1])) + match[2] + (match[2].includes('.') ? '' : '.mp4'));
  };
  const append = (list, version, refs) => {
    for (const ref of refs.split(',')) {
      const url = expand(ref.trim());
      if (!url || deadUrls.has(url) || deadHosts.has(new URL(url).hostname.toLowerCase())) { report.rejectedSources++; continue; }
      if (list.some((s) => s.url === url)) { report.duplicateSources++; continue; }
      list.push({ url, label: version === 'dub' ? 'Dublado' : version === 'leg' ? 'Legendado' : 'Original' });
      report.sources++;
    }
    if (list.length > 128) throw new Error('Título excede o limite de fontes');
  };
  const movies = new Map(); const series = new Map();
  for (const letter of [...new Set(letters)].sort()) {
    for (const line of await read(`vod/filmes-${letter}.txt`)) {
      const [name, ...parts] = line.split('\t');
      if (!name || !parts.length) continue;
      const id = 'm-' + identity('saimo', normalized(name));
      const sources = movies.get(id)?.sources ?? [];
      // Prefere dublado e conserva a ordem de prioridade de cada versão.
      for (const part of parts.sort((a, b) => Number(b.startsWith('dub=')) - Number(a.startsWith('dub=')))) {
        const split = part.indexOf('=');
        if (split > 0) append(sources, part.slice(0, split), part.slice(split + 1));
      }
      if (sources.length) movies.set(id, { id, name, group: 'Saimo · Filmes', poster: posters.get(`f|${name}`), url: sources[0].url, sources });
    }
  }
  const parseEpisodes = async (file, group) => {
    let current;
    for (const line of await read(file)) {
      if (line.startsWith('@')) {
        const [name, year = ''] = line.slice(1).split('\t');
        if (!name) { current = undefined; continue; }
        const id = 's-' + identity('saimo', normalized(name), year);
        current = series.get(id) ?? { id, name: year && !name.includes(year) ? `${name} (${year})` : name, group, poster: posters.get(`s|${name}`), seasons: new Map() };
        series.set(id, current);
        continue;
      }
      if (!current) continue;
      const [seasonRaw, episodeRaw, version, refs] = line.split('\t');
      if (!/^\d+$/.test(seasonRaw) || !/^\d+$/.test(episodeRaw) || !refs) continue;
      const season = Number(seasonRaw); const episode = Number(episodeRaw);
      if (!Number.isSafeInteger(season) || !Number.isSafeInteger(episode)) continue;
      const episodes = current.seasons.get(season) ?? new Map();
      const id = 'e-' + identity(current.id, season, episode);
      const sources = episodes.get(id)?.sources ?? [];
      append(sources, version, refs);
      sources.sort((a, b) => Number(b.label === 'Dublado') - Number(a.label === 'Dublado'));
      if (!sources.length) continue;
      episodes.set(id, { id, title: `Episódio ${episode}`, season, episode, url: sources[0].url, sources });
      current.seasons.set(season, episodes);
    }
  };
  for (const file of (await readdir(join(source, 'vod'))).sort()) {
    if (/^series-[A-Z#]-\d+\.txt$/.test(file)) await parseEpisodes(`vod/${file}`, 'Saimo · Séries');
  }
  for (const kind of ['animes', 'doramas']) await parseEpisodes(`vod/redeflix/links-${kind}.txt`, `Saimo · ${kind === 'animes' ? 'Animes' : 'Doramas'}`);
  for (const [id, item] of series) if (!item.seasons.size) series.delete(id);
  for (const item of movies.values()) if (item.sources.length > 1) report.multiSourceMovies++;
  if (!movies.size || !series.size) throw new Error('Catálogo Saimo vazio');
  return writeCatalog({ movies, series, report, version: 'v3-' + hash.digest('hex').slice(0, 16) }, output);
}

async function main() {
  const args = process.argv.slice(2);
  const output = args.includes('--output') ? args[args.indexOf('--output') + 1] : 'catalog-output/saimo';
  let temp;
  try {
    let source = args.includes('--source-dir') ? args[args.indexOf('--source-dir') + 1] : null;
    if (!source) {
      temp = await mkdtemp(join(tmpdir(), 'brtv-saimo-'));
      source = join(temp, 'source');
      const config = JSON.parse(await readFile(new URL('../saimo.config.json', import.meta.url), 'utf8'));
      await exec('git', ['clone', '--quiet', '--no-checkout', '--depth', '1', config.repository, source], { timeout: 180_000 });
      await exec('git', ['-C', source, 'fetch', '--quiet', '--depth', '1', 'origin', config.revision], { timeout: 180_000 });
      await exec('git', ['-C', source, 'checkout', '--quiet', '--detach', config.revision], { timeout: 60_000 });
    }
    console.log(JSON.stringify(await buildSaimoCatalog(source, output), null, 2));
  } finally { if (temp) await rm(temp, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => { console.error('Falha ao preparar catálogo Saimo. Nenhuma atualização foi publicada.'); process.exitCode = 1; });
}
