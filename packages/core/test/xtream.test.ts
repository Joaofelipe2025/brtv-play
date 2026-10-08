import { describe, expect, it } from 'vitest';
import { XtreamClient, XtreamError, type FetchLike } from '../src/xtream';

function fakeFetch(routes: Record<string, unknown>, status = 200): {
  fetch: FetchLike;
  calls: string[];
} {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const action = new URL(url).searchParams.get('action') ?? 'auth';
    return {
      ok: status === 200,
      status,
      json: async () => routes[action] ?? {},
    };
  };
  return { fetch, calls };
}

const creds = { server: 'http://servidor.test:8080/', username: 'u1', password: 'p1' };

describe('XtreamClient', () => {
  it('autentica com user_info.auth = 1', async () => {
    const { fetch } = fakeFetch({
      auth: { user_info: { auth: 1, status: 'Active', exp_date: '1900000000' } },
    });
    const client = new XtreamClient(creds, fetch);
    const info = await client.authenticate();
    expect(info.status).toBe('Active');
  });

  it('rejeita credenciais inválidas', async () => {
    const { fetch } = fakeFetch({ auth: { user_info: { auth: 0 } } });
    const client = new XtreamClient(creds, fetch);
    await expect(client.authenticate()).rejects.toBeInstanceOf(XtreamError);
  });

  it('lança XtreamError em resposta HTTP de erro', async () => {
    const { fetch } = fakeFetch({}, 500);
    const client = new XtreamClient(creds, fetch);
    await expect(client.getLiveCategories()).rejects.toThrow('Falha HTTP 500');
  });

  it('monta a URL da API sem barra duplicada e com action e credenciais', async () => {
    const { fetch, calls } = fakeFetch({ get_live_streams: [] });
    const client = new XtreamClient(creds, fetch);
    await client.getLiveStreams('7');
    const url = new URL(calls[0] ?? '');
    expect(url.pathname).toBe('/player_api.php');
    expect(url.searchParams.get('action')).toBe('get_live_streams');
    expect(url.searchParams.get('category_id')).toBe('7');
    expect(url.searchParams.get('username')).toBe('u1');
  });

  it('retorna categorias e streams de VOD e séries', async () => {
    const { fetch } = fakeFetch({
      get_vod_categories: [{ category_id: '1', category_name: 'Ação' }],
      get_vod_streams: [{ stream_id: 10, name: 'Filme', category_id: '1' }],
      get_series: [{ series_id: 5, name: 'Série', category_id: '2' }],
      get_series_info: { episodes: { '1': [{ id: '99', episode_num: 1, title: 'Ep 1' }] } },
    });
    const client = new XtreamClient(creds, fetch);
    expect((await client.getVodCategories())[0]?.category_name).toBe('Ação');
    expect((await client.getVodStreams())[0]?.name).toBe('Filme');
    expect((await client.getSeries())[0]?.name).toBe('Série');
    const info = await client.getSeriesInfo(5);
    expect(info.episodes['1']?.[0]?.title).toBe('Ep 1');
  });

  it('monta URLs de stream de live, VOD e episódio', () => {
    const client = new XtreamClient(creds, fakeFetch({}).fetch);
    expect(client.liveStreamUrl(42)).toBe('http://servidor.test:8080/live/u1/p1/42.m3u8');
    expect(client.liveStreamUrl(42, 'ts')).toBe('http://servidor.test:8080/live/u1/p1/42.ts');
    expect(client.vodStreamUrl(10, 'mkv')).toBe('http://servidor.test:8080/movie/u1/p1/10.mkv');
    expect(client.episodeStreamUrl('99')).toBe('http://servidor.test:8080/series/u1/p1/99.mp4');
  });
});
