import { describe, expect, it } from 'vitest';
import { classifyM3u, parseM3u } from '../src/m3u';
import { DEMO_M3U } from '../src/api';

function lib(content: string) {
  return classifyM3u(parseM3u(content));
}

describe('classifyM3u', () => {
  it('mantém canais comuns como ao vivo', () => {
    const r = lib(`#EXTINF:-1 group-title="Notícias",Canal\nhttp://x.test/live/1.m3u8`);
    expect(r.live).toHaveLength(1);
    expect(r.movies).toHaveLength(0);
  });

  it('reconhece filmes por grupo, extensão e caminho /movie/', () => {
    const r = lib(`#EXTINF:-1 group-title="Filmes | Ação",A
http://x.test/a.m3u8
#EXTINF:-1 group-title="Outros",B
http://x.test/b.mp4
#EXTINF:-1 group-title="Outros",C
http://x.test/movie/u/p/3.ts`);
    expect(r.movies.map((m) => m.name)).toEqual(['A', 'B', 'C']);
    expect(r.live).toHaveLength(0);
  });

  it('agrupa episódios SxxExx em séries e temporadas ordenadas', () => {
    const r = lib(`#EXTINF:-1 group-title="Séries | Drama",Minha Série S01 E02 Segundo
http://x.test/2.mp4
#EXTINF:-1 group-title="Séries | Drama",Minha Série S01 E01
http://x.test/1.mp4
#EXTINF:-1 group-title="Séries | Drama",Minha Série S02E01
http://x.test/3.mp4`);
    expect(r.series).toHaveLength(1);
    const s = r.series[0]!;
    expect(s.name).toBe('Minha Série');
    expect(Object.keys(s.seasons).sort()).toEqual(['1', '2']);
    expect(s.seasons['1']!.map((e) => e.episode)).toEqual([1, 2]);
    expect(s.seasons['1']![1]!.title).toBe('Segundo');
    expect(s.seasons['1']![0]!.title).toBe('Episódio 1');
  });

  it('item de série sem SxxExx vira filme em vez de sumir', () => {
    const r = lib(`#EXTINF:-1 group-title="Séries | X",Especial
http://x.test/esp.mp4`);
    expect(r.series).toHaveLength(0);
    expect(r.movies).toHaveLength(1);
  });

  it('SxxExx em canal ao vivo comum não vira série', () => {
    const r = lib(`#EXTINF:-1 group-title="Variedades",Programa S01E01
http://x.test/live/9.m3u8`);
    expect(r.live).toHaveLength(1);
    expect(r.series).toHaveLength(0);
  });

  it('a playlist de demonstração tem ao vivo, filmes e séries', () => {
    const r = lib(DEMO_M3U);
    expect(r.live.length).toBeGreaterThan(0);
    expect(r.movies.length).toBeGreaterThan(0);
    expect(r.series.length).toBe(1);
  });
});
