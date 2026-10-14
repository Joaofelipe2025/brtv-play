import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildCatalog, searchBucket, words } from './build-vod-catalog.mjs';

const row = (name, group, media) => `#EXTINF:-1 group-title="${group}" tvg-logo="https://example.org/cover.jpg",${name}\nhttps://example.org/${media}.mp4?token=temporary\n`;
async function fixture(run) {
  const dir = await mkdtemp(join(tmpdir(), 'brtv-catalog-'));
  try { await run(dir); } finally { await rm(dir, { recursive: true, force: true }); }
}
test('página, busca, temporadas, IDs e versões conservam o conteúdo', async () => fixture(async (dir) => {
  const input = join(dir, 'list.m3u8'); const out = join(dir, 'output');
  const rows = Array.from({ length: 65 }, (_, i) => row(`Ação ${i}`, 'FILMES | Ação', `movie-${i}`));
  rows.push(row('Mesmo Nome (2020) S01E01', 'SÉRIES | Drama', 'ep-1'));
  rows.push(row('Mesmo Nome (2020) S01E01', 'SÉRIES | Drama', 'ep-1'));
  rows.push(row('Mesmo Nome (2020) S01E01', 'SÉRIES | Drama', 'ep-alternative'));
  rows.push(row('Mesmo Nome (2024) S01E01', 'SÉRIES | Drama', 'ep-other-year'));
  rows.push(row('Mesmo Nome (2020) S01E01', 'SÉRIES | Outra', 'ep-other-group'));
  rows.push(row('Sem episódio', 'SÉRIES | Drama', 'unclassified'));
  await writeFile(input, '#EXTM3U\n' + rows.join(''));
  const result = await buildCatalog(input, out);
  assert.equal(result.movies, 65); assert.equal(result.series, 3); assert.equal(result.episodes, 4);
  assert.equal(result.duplicates, 1); assert.equal(result.invalid, 1);
  const read = async (path) => JSON.parse(await readFile(join(out, result.version, path), 'utf8'));
  const pages = await Promise.all([0, 1, 2].map((p) => read(`movies/all/${p}.json`)));
  assert.deepEqual(pages.map((p) => p.items.length), [30, 30, 5]);
  assert.deepEqual(pages.map((p) => p.next), [1, 2, null]);
  assert.equal(new Set(pages.flatMap((p) => p.items.map((e) => e.id))).size, 65);
  assert.ok(!('url' in pages[0].items[0]));
  const detail = await read(`items/${pages[0].items[0].id}.json`);
  assert.ok(detail.url.endsWith('token=temporary'));
  const bucket = searchBucket(words('ação')[0]);
  const search = await read(`search/movies/${bucket}/0.json`);
  assert.equal(search.items.length, 65);
  assert.ok(!('url' in search.items[0]));
  const previousId = pages[0].items[0].id;
  await writeFile(input, '#EXTM3U\n' + [...rows].reverse().join('').replaceAll('token=temporary', 'token=rotated'));
  const newer = await buildCatalog(input, out);
  assert.notEqual(newer.version, result.version);
  const updated = JSON.parse(await readFile(join(out, newer.version, 'movies/all/0.json'), 'utf8'));
  assert.equal(updated.items[0].id, previousId);
  assert.equal((await read('manifest.json')).version, result.version);
  const pointer = await readFile(join(out, 'manifest.json'), 'utf8');
  await writeFile(input, 'not a playlist');
  await assert.rejects(buildCatalog(input, out));
  assert.equal(await readFile(join(out, 'manifest.json'), 'utf8'), pointer);
}));

test('primeira aparição é persistente, acervo inicial fica sem data e ordenação precede paginação', async () => fixture(async (dir) => {
  const input = join(dir, 'list.m3u8'); const out = join(dir, 'output');
  const old = Array.from({ length: 65 }, (_, i) => row(`Antigo ${i}`, 'Filmes', `old-${i}`)).join('');
  await writeFile(input, '#EXTM3U\n' + old);
  const initial = await buildCatalog(input, out);
  const read = async (version, path) => JSON.parse(await readFile(join(out, version, path), 'utf8'));
  assert.ok((await read(initial.version, 'movies/all/0.json')).items.every((e) => e.addedAt === undefined));
  await writeFile(input, '#EXTM3U\n' + old + row('Z Novo', 'Filmes', 'new'));
  const updated = await buildCatalog(input, out);
  const first = (await read(updated.version, 'movies/all/0.json')).items[0];
  assert.equal(first.name, 'Z Novo'); assert.ok(first.addedAt > 0);
  const repeated = await buildCatalog(input, out);
  assert.equal(repeated.version, updated.version);
  assert.equal((await read(repeated.version, 'movies/all/0.json')).items[0].addedAt, first.addedAt);
  assert.equal((await read(updated.version, 'alphabetical/movies/all/2.json')).items.at(-1).name, 'Z Novo');
  const search = await read(updated.version, `search/movies/${searchBucket('novo')}/0.json`);
  assert.equal(search.items[0].id, first.id);
}));
