import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSaimoCatalog } from './build-saimo-catalog.mjs';

test('Saimo: snapshot, bases explícitas, fontes, episódios e publicação atômica', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'brtv-saimo-test-'));
  try {
    const src = join(dir, 'input'); const out = join(dir, 'out');
    await mkdir(join(src, 'vod/redeflix'), { recursive: true });
    const put = (name, data) => writeFile(join(src, name), data);
    await put('vod/indice.txt', 'base: 7 https://example.org/movie/\nbase: 2 http://backup.example.org:80/vod/\n#\t1\t2\t0\n');
    await put('fontes-mortas.txt', 'servidor: dead.example.org\nhttp://backup.example.org:80/vod/blocked.mp4\n');
    await put('vod/fichas.txt', 'capa: https://images.example.org/\nf\t123 Filme\t1\tposter.jpg\tAção\n');
    await put('vod/filmes-#.txt', '123 Filme\tleg=2:alternative.m3u8\tdub=7:123,7:123,2:blocked.mp4,https://dead.example.org/movie.mp4,9:invalid\n');
    await put('vod/series-#-0.txt', '@123 Série\t2020\n1\t1\tleg\t2:ep1.m3u8\n1\t1\tdub\t7:ep1\n1\t2\tdub\t7:ep2\n@123 Série\t2024\n1\t1\tdub\t7:remake\n');
    await put('vod/redeflix/links-animes.txt', '');
    await put('vod/redeflix/links-doramas.txt', '');
    const result = await buildSaimoCatalog(src, out);
    assert.equal(result.movies, 1);
    assert.equal(result.series, 2);
    assert.equal(result.episodes, 3);
    assert.equal(result.rejectedSources, 3);
    assert.equal(result.duplicateSources, 1);
    const read = async (file, version = result.version) => JSON.parse(await readFile(join(out, version, file), 'utf8'));
    const summary = (await read('movies/all/0.json')).items[0];
    assert.ok(!('sources' in summary)); assert.ok(!('url' in summary));
    assert.equal(summary.poster, 'https://images.example.org/poster.jpg');
    const detail = await read(`items/${summary.id}.json`);
    assert.deepEqual(detail.sources, [
      { url: 'https://example.org/movie/123.mp4', label: 'Dublado' },
      { url: 'http://backup.example.org/vod/alternative.m3u8', label: 'Legendado' },
    ]);
    const series = (await read('series/all/0.json')).items.find((s) => s.name.includes('2020'));
    const episodes = (await read(`episodes/${series.id}/1/0.json`)).items;
    assert.equal(episodes.length, 2);
    assert.deepEqual(episodes[0].sources.map((s) => s.label), ['Dublado', 'Legendado']);
    assert.equal(episodes[0].url, 'https://example.org/movie/ep1.mp4');
    await put('vod/indice.txt', 'base: 7 https://new.example.org/movie/\nbase: 2 http://backup.example.org/vod/\n#\t1\t2\t0\n');
    const changed = await buildSaimoCatalog(src, out);
    assert.notEqual(changed.version, result.version);
    assert.equal((await read('movies/all/0.json', changed.version)).items[0].id, summary.id);
    assert.equal((await read(`items/${summary.id}.json`)).url, detail.url);
    const pointer = await readFile(join(out, 'manifest.json'), 'utf8');
    await put('vod/indice.txt', 'broken');
    await assert.rejects(buildSaimoCatalog(src, out));
    assert.equal(await readFile(join(out, 'manifest.json'), 'utf8'), pointer);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
