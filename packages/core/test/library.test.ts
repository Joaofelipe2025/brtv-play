import { describe, expect, it } from 'vitest';
import { DEMO_M3U } from '../src/api';
import {
  cleanGroup,
  loadEpg,
  loadLibrary,
  loadSeasons,
  type LibraryFetch,
} from '../src/library';

function xtreamFetch(): LibraryFetch {
  const routes: Record<string, unknown> = {
    auth: { user_info: { auth: 1 } },
    get_live_categories: [{ category_id: '1', category_name: 'Notícias' }],
    get_live_streams: [
      { stream_id: 10, name: 'Canal A', stream_icon: 'http://i/a.png', category_id: '1', epg_channel_id: 'a.br' },
    ],
    get_vod_categories: [{ category_id: '2', category_name: 'Ação' }],
    get_vod_streams: [
      { stream_id: 20, name: 'Filme X', stream_icon: 'http://i/x.png', category_id: '2', container_extension: 'mkv' },
    ],
    get_series_categories: [{ category_id: '3', category_name: 'Drama' }],
    get_series: [{ series_id: 30, name: 'Série Y', cover: 'http://i/y.png', category_id: '3', plot: 'Trama' }],
    get_series_info: {
      episodes: { '1': [{ id: '501', episode_num: 1, title: 'Piloto', container_extension: 'mp4' }] },
    },
  };
  return async (url) => {
    const action = new URL(url).searchParams.get('action') ?? 'auth';
    return {
      ok: true,
      status: 200,
      json: async () => routes[action] ?? {},
      text: async () => '',
    };
  };
}

const xtreamPlaylist = {
  id: 'x',
  name: 'X',
  kind: 'xtream' as const,
  server: 'http://srv.test:8080/',
  username: 'us er',
  password: 'p&ss',
};

describe('cleanGroup', () => {
  it('remove o prefixo de tipo', () => {
    expect(cleanGroup('Filmes | Ação')).toBe('Ação');
  });
  it('mantém grupos sem prefixo', () => {
    expect(cleanGroup('Notícias')).toBe('Notícias');
  });
});

describe('loadLibrary', () => {
  it('monta a biblioteca a partir de M3U', async () => {
    const lib = await loadLibrary({ id: 'd', name: 'Demo', kind: 'm3u', content: DEMO_M3U }, 'hls');
    expect(lib.live.length).toBeGreaterThanOrEqual(10);
    expect(lib.movies.length).toBeGreaterThanOrEqual(10);
    expect(lib.series.length).toBe(3);
    // Capas temporárias em todos os filmes e séries da demonstração
    expect(lib.movies.every((m) => m.poster?.startsWith('https://picsum.photos/seed/brtv-'))).toBe(true);
    expect(lib.series.every((s) => s.cover?.startsWith('https://picsum.photos/seed/brtv-'))).toBe(true);
    expect(lib.movies.every((m) => m.id.startsWith('vod-'))).toBe(true);
    expect(lib.movies.map((m) => m.group)).toContain('Demonstração');
    expect(lib.xtream).toBeNull();
    expect(lib.epgUrl).toBeNull();
  });

  it('monta a biblioteca Xtream com URLs .m3u8', async () => {
    const lib = await loadLibrary(xtreamPlaylist, 'hls', xtreamFetch());
    expect(lib.live[0]).toMatchObject({
      id: '10',
      group: 'Notícias',
      logo: 'http://i/a.png',
      epgId: 'a.br',
      url: 'http://srv.test:8080/live/us er/p&ss/10.m3u8',
    });
    expect(lib.movies[0]).toMatchObject({
      id: 'vod-20',
      poster: 'http://i/x.png',
      url: 'http://srv.test:8080/movie/us er/p&ss/20.mkv',
    });
    expect(lib.series[0]).toMatchObject({
      id: 'xseries-30',
      cover: 'http://i/y.png',
      plot: 'Trama',
      xtreamId: 30,
    });
    expect(lib.epgUrl).toBe('http://srv.test:8080/xmltv.php?username=us%20er&password=p%26ss');
    expect(lib.xtream).not.toBeNull();
  });

  it('usa .ts quando o formato é ts', async () => {
    const lib = await loadLibrary(xtreamPlaylist, 'ts', xtreamFetch());
    expect(lib.live[0]?.url.endsWith('/10.ts')).toBe(true);
  });

  describe('M3U por link', () => {
    const M3U_TEXT = [
      '#EXTM3U',
      '#EXTINF:-1 tvg-id="a.br" tvg-logo="http://exemplo.test/a.png" group-title="Notícias",Canal A',
      'http://exemplo.test/live/a.m3u8',
    ].join('\n');

    function textFetch(calls: string[], body: string, status = 200): LibraryFetch {
      return async (url) => {
        calls.push(url);
        return {
          ok: status >= 200 && status < 300,
          status,
          json: async () => {
            throw new Error('não deveria chamar json()');
          },
          text: async () => body,
        };
      };
    }

    it('baixa o texto do link e monta a biblioteca', async () => {
      const calls: string[] = [];
      const lib = await loadLibrary(
        { id: 'u', name: 'Link', kind: 'm3u', url: 'http://exemplo.test/lista.m3u' },
        'hls',
        textFetch(calls, M3U_TEXT),
      );
      expect(calls).toEqual(['http://exemplo.test/lista.m3u']);
      expect(lib.live).toHaveLength(1);
      expect(lib.live[0]).toMatchObject({
        name: 'Canal A',
        group: 'Notícias',
        url: 'http://exemplo.test/live/a.m3u8',
      });
      expect(lib.xtream).toBeNull();
      expect(lib.epgUrl).toBeNull();
    });

    it('falha com a mensagem do status quando o download não é ok', async () => {
      await expect(
        loadLibrary(
          { id: 'u', name: 'Link', kind: 'm3u', url: 'http://exemplo.test/lista.m3u' },
          'hls',
          textFetch([], '', 404),
        ),
      ).rejects.toThrow('Falha ao baixar a lista (HTTP 404)');
    });

    it('prefere o conteúdo embutido e não baixa o link', async () => {
      const calls: string[] = [];
      const lib = await loadLibrary(
        {
          id: 'u',
          name: 'Ambos',
          kind: 'm3u',
          content: M3U_TEXT,
          url: 'http://exemplo.test/lista.m3u',
        },
        'hls',
        textFetch(calls, ''),
      );
      expect(calls).toEqual([]);
      expect(lib.live).toHaveLength(1);
    });

    it('falha quando a lista não tem conteúdo nem link', async () => {
      await expect(
        loadLibrary({ id: 'u', name: 'Vazia', kind: 'm3u' }, 'hls', textFetch([], '')),
      ).rejects.toThrow('A lista M3U não tem conteúdo nem link.');
    });
  });
});

describe('loadSeasons', () => {
  it('devolve as temporadas já presentes (M3U)', async () => {
    const lib = await loadLibrary({ id: 'd', name: 'Demo', kind: 'm3u', content: DEMO_M3U }, 'hls');
    const entry = lib.series[0]!;
    expect(await loadSeasons(lib, entry)).toBe(entry.seasons);
  });

  it('mapeia episódios do Xtream com URL de episódio', async () => {
    const lib = await loadLibrary(xtreamPlaylist, 'hls', xtreamFetch());
    const seasons = await loadSeasons(lib, lib.series[0]!);
    expect(seasons['1']).toEqual([
      {
        id: 'ep-501',
        season: 1,
        episode: 1,
        title: 'Piloto',
        url: 'http://srv.test:8080/series/us er/p&ss/501.mp4',
      },
    ]);
  });
});

const XMLTV = `<tv><programme start="20260101120000 +0000" stop="20260101130000 +0000" channel="a.br"><title>Jornal</title></programme></tv>`;

describe('loadEpg', () => {
  it('devolve mapa vazio sem URL', async () => {
    expect((await loadEpg(null)).size).toBe(0);
  });

  it('usa text() quando a resposta não tem body', async () => {
    const fetchFn: LibraryFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => XMLTV,
    });
    const epg = await loadEpg('http://x/epg', fetchFn);
    expect(epg.get('a.br')?.[0]?.title).toBe('Jornal');
  });

  it('sem body, ignora XMLTV acima de 60 MB sem ler o texto', async () => {
    let textCalled = false;
    const fetchFn: LibraryFetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? String(61 * 1024 * 1024) : null) },
      json: async () => ({}),
      text: async () => {
        textCalled = true;
        return XMLTV;
      },
    });
    expect((await loadEpg('http://x/epg', fetchFn)).size).toBe(0);
    expect(textCalled).toBe(false);
  });

  it('sem body, lê XMLTV com content-length dentro do limite', async () => {
    const fetchFn: LibraryFetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: (name: string) => (name.toLowerCase() === 'content-length' ? String(XMLTV.length) : null) },
      json: async () => ({}),
      text: async () => XMLTV,
    });
    expect((await loadEpg('http://x/epg', fetchFn)).get('a.br')?.length).toBe(1);
  });

  it('com body, o limite de tamanho não se aplica (streaming)', async () => {
    const bytes = new TextEncoder().encode(XMLTV);
    let sent = false;
    const fetchFn: LibraryFetch = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => String(500 * 1024 * 1024) },
      json: async () => ({}),
      text: async () => '',
      body: {
        getReader: () => ({
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
        }),
      },
    });
    expect((await loadEpg('http://x/epg', fetchFn)).get('a.br')?.length).toBe(1);
  });

  it('lê o body em streaming quando existe', async () => {
    const bytes = new TextEncoder().encode(XMLTV);
    let sent = false;
    const fetchFn: LibraryFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({}),
      text: async () => {
        throw new Error('não deveria chamar text()');
      },
      body: {
        getReader: () => ({
          read: async () => {
            if (sent) return { done: true, value: undefined };
            sent = true;
            return { done: false, value: bytes };
          },
        }),
      },
    });
    const epg = await loadEpg('http://x/epg', fetchFn);
    expect(epg.get('a.br')?.length).toBe(1);
  });

  it('devolve vazio em resposta não ok', async () => {
    const fetchFn: LibraryFetch = async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
      text: async () => XMLTV,
    });
    expect((await loadEpg('http://x/epg', fetchFn)).size).toBe(0);
  });
});
