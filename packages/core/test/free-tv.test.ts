import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryAdapter } from '../src/storage';
import {
  FREE_TV_CACHE_KEY,
  FREE_TV_PLAYLIST,
  FREE_TV_PLAYLIST_ID,
  FREE_TV_SOURCE,
  FREE_TV_TIMEOUT_MS,
  FREE_TV_URL,
  freeTvPlaybackIssue,
  loadFreeTvLibrary,
  parseFreeTvChannels,
  type PlaylistFetch,
} from '../src/free-tv';

const ENTRADA_A =
  '#EXTINF:-1 tvg-id="tv.br" tvg-logo="http://exemplo.test/a.png" group-title="Brasil",TV Brasil\nhttp://exemplo.test/a.m3u8\n';
const ENTRADA_B =
  '#EXTINF:-1 tvg-id="tv.br" group-title="Brasil",TV Brasil 2\nhttp://exemplo.test/b.m3u8\n';
const ENTRADA_C = '#EXTINF:-1 group-title="Notícias",Canal Sem Id\nhttp://exemplo.test/c.m3u8\n';
const LISTA = `#EXTM3U\n${ENTRADA_A}${ENTRADA_B}${ENTRADA_C}`;
const LISTA_NOVA = `#EXTM3U\n${ENTRADA_C}`;

/** Resposta falsa estrutural, no formato mínimo exigido por `PlaylistFetch`. */
function resposta(body = LISTA, opts: { ok?: boolean; length?: string | null } = {}) {
  return {
    ok: opts.ok ?? true,
    headers: {
      get: (name: string) => (name.toLowerCase() === 'content-length' ? (opts.length ?? null) : null),
    },
    text: async () => body,
  };
}

function fetchFalso(body = LISTA, opts: { ok?: boolean; length?: string | null } = {}) {
  return vi.fn<PlaylistFetch>(async () => resposta(body, opts));
}

const fetchOffline: PlaylistFetch = async () => {
  throw new Error('offline');
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Free-TV: constantes e procedência', () => {
  it('aponta para a playlist oficial e documenta a origem', () => {
    expect(FREE_TV_URL).toBe('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8');
    expect(FREE_TV_SOURCE.url).toBe(FREE_TV_URL);
    expect(FREE_TV_SOURCE.repo).toBe('https://github.com/Free-TV/IPTV');
    expect(FREE_TV_SOURCE.descricao).toContain('Sem canais pagos');
  });

  it('expõe a lista como M3U por link, sem conteúdo embutido', () => {
    expect(FREE_TV_PLAYLIST).toEqual({
      id: FREE_TV_PLAYLIST_ID,
      name: 'Catálogo público de testes',
      kind: 'm3u',
      url: FREE_TV_URL,
    });
    expect(FREE_TV_PLAYLIST_ID).toBe('free-tv');
  });
});

describe('parseFreeTvChannels', () => {
  it('gera ids únicos mesmo quando o id de EPG se repete, preservando o tvgId', () => {
    const canais = parseFreeTvChannels(`#EXTM3U\n${ENTRADA_A}${ENTRADA_B}${ENTRADA_A}`);
    expect(canais).toHaveLength(3);
    expect(new Set(canais.map((c) => c.id)).size).toBe(3);
    expect(canais.every((c) => c.id.startsWith('free-tv:'))).toBe(true);
    expect(canais.map((c) => c.tvgId)).toEqual(['tv.br', 'tv.br', 'tv.br']);
  });

  it('mantém o id de uma entrada estável quando a ordem da lista muda', () => {
    const primeira = parseFreeTvChannels(`#EXTM3U\n${ENTRADA_A}${ENTRADA_B}`);
    const invertida = parseFreeTvChannels(`#EXTM3U\n${ENTRADA_B}${ENTRADA_A}`);
    expect(primeira[0]?.id).toBe(invertida[1]?.id);
    expect(primeira[1]?.id).toBe(invertida[0]?.id);
  });

  it('numera a ocorrência de entradas idênticas', () => {
    const [um, dois] = parseFreeTvChannels(`#EXTM3U\n${ENTRADA_A}${ENTRADA_A}`);
    expect(um?.id).not.toBe(dois?.id);
    expect(um?.id.endsWith(':0')).toBe(true);
    expect(dois?.id.endsWith(':1')).toBe(true);
  });

  it('funciona para entrada sem tvg-id', () => {
    const [canal] = parseFreeTvChannels(`#EXTM3U\n${ENTRADA_C}`);
    expect(canal?.tvgId).toBeUndefined();
    expect(canal?.id.startsWith('free-tv:')).toBe(true);
  });
});

describe('freeTvPlaybackIssue', () => {
  it.each([
    'https://www.youtube.com/watch?v=abc',
    'https://youtu.be/abc',
    'https://m.youtube.com/live/abc',
    'https://www.twitch.tv/canal',
    'https://www.dailymotion.com/video/x1',
    'https://dai.ly/x1',
  ])('avisa para página de vídeo externa: %s', (url) => {
    const aviso = freeTvPlaybackIssue(url);
    expect(aviso).toContain('página de vídeo externa');
    expect(aviso).toContain('Escolha outro canal');
  });

  it.each([
    'http://exemplo.test/live.m3u8',
    'https://youtube.com.exemplo.test/live.m3u8',
    'https://notyoutube.com/live.m3u8',
    'http://exemplo.test/redirect?to=youtube.com',
  ])('devolve null para stream normal ou domínio parecido: %s', (url) => {
    expect(freeTvPlaybackIssue(url)).toBeNull();
  });
});

describe('loadFreeTvLibrary: download', () => {
  it('baixa a fonte oficial, monta só TV ao vivo e salva o cache', async () => {
    const storage = new MemoryAdapter();
    const fetchFn = fetchFalso();

    const { library, fromCache, notice } = await loadFreeTvLibrary({ storage, fetchFn });

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledWith(FREE_TV_URL, { signal: expect.any(AbortSignal) });
    expect(fromCache).toBe(false);
    expect(notice).toBeNull();
    expect(library.live.map((c) => c.name)).toEqual(['TV Brasil', 'TV Brasil 2', 'Canal Sem Id']);
    expect(library.live.map((c) => c.group)).toEqual(['Brasil', 'Brasil', 'Notícias']);
    expect(new Set(library.live.map((c) => c.id)).size).toBe(3);
    expect(library.live[0]).toMatchObject({
      url: 'http://exemplo.test/a.m3u8',
      logo: 'http://exemplo.test/a.png',
      epgId: 'tv.br',
    });
    expect(library.live[2]).not.toHaveProperty('logo');
    expect(library.live[2]).not.toHaveProperty('epgId');
    expect(library.movies).toEqual([]);
    expect(library.series).toEqual([]);
    expect(library.xtream).toBeNull();
    expect(library.epgUrl).toBeNull();
    expect(await storage.get(FREE_TV_CACHE_KEY)).toBe(LISTA);
  });

  it('não transforma nomes de filme ou série em VOD', async () => {
    const conteudo =
      '#EXTM3U\n' +
      '#EXTINF:-1 group-title="Filmes | Ação",Filme 24h\nhttp://exemplo.test/filme.mp4\n' +
      '#EXTINF:-1 group-title="Séries | Drama",Serie S01E02\nhttp://exemplo.test/series/x.m3u8\n' +
      '#EXTINF:-1 group-title="Movies",Cinema\nhttp://exemplo.test/movie/y.m3u8\n';
    const { library } = await loadFreeTvLibrary({
      storage: new MemoryAdapter(),
      fetchFn: fetchFalso(conteudo),
    });
    expect(library.live).toHaveLength(3);
    expect(library.movies).toEqual([]);
    expect(library.series).toEqual([]);
  });

  it('usa o fetch global resolvido no momento da chamada quando não recebe fetchFn', async () => {
    const globalFetch = fetchFalso();
    vi.stubGlobal('fetch', globalFetch);
    const { library } = await loadFreeTvLibrary({ storage: new MemoryAdapter() });
    expect(globalFetch).toHaveBeenCalledWith(FREE_TV_URL, { signal: expect.any(AbortSignal) });
    expect(library.live).toHaveLength(3);
  });

  it('falha ao salvar o cache não impede abrir o catálogo baixado', async () => {
    const storage = new MemoryAdapter();
    vi.spyOn(storage, 'set').mockRejectedValue(new Error('cheio'));
    const { library, fromCache } = await loadFreeTvLibrary({ storage, fetchFn: fetchFalso() });
    expect(fromCache).toBe(false);
    expect(library.live).toHaveLength(3);
  });

  it('falha ao ler o cache cai para o download', async () => {
    const storage = new MemoryAdapter();
    vi.spyOn(storage, 'get').mockRejectedValue(new Error('indisponível'));
    const fetchFn = fetchFalso();
    const { library, fromCache } = await loadFreeTvLibrary({ storage, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fromCache).toBe(false);
    expect(library.live).toHaveLength(3);
  });
});

describe('loadFreeTvLibrary: validação', () => {
  const invalidas: Array<[string, string, { ok?: boolean; length?: string | null }]> = [
    ['vazia', '', {}],
    ['sem #EXTM3U', '<html>erro</html>', {}],
    ['sem canais', '#EXTM3U\n', {}],
    ['grande demais (corpo)', `#EXTM3U\n${'#'.repeat(5_000_001)}`, {}],
    ['grande demais (content-length)', LISTA, { length: '5000001' }],
    ['HTTP com erro', LISTA, { ok: false }],
  ];

  it.each(invalidas)('rejeita lista %s e mantém o cache válido', async (_nome, corpo, opts) => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, LISTA);
    const { library, fromCache, notice } = await loadFreeTvLibrary({
      storage,
      fetchFn: fetchFalso(corpo, opts),
      force: true,
    });
    expect(fromCache).toBe(true);
    expect(notice).toContain('último catálogo salvo');
    expect(library.live).toHaveLength(3);
    expect(await storage.get(FREE_TV_CACHE_KEY)).toBe(LISTA);
  });

  it.each(invalidas)('lança erro pt-BR para lista %s sem cache válido', async (_nome, corpo, opts) => {
    const storage = new MemoryAdapter();
    await expect(
      loadFreeTvLibrary({ storage, fetchFn: fetchFalso(corpo, opts) }),
    ).rejects.toThrow('Verifique a internet');
    expect(await storage.get(FREE_TV_CACHE_KEY)).toBeNull();
  });
});

describe('loadFreeTvLibrary: cache e falhas', () => {
  it('falha de rede com cache válido devolve o catálogo salvo com aviso', async () => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, LISTA);
    const { library, fromCache, notice } = await loadFreeTvLibrary({
      storage,
      fetchFn: fetchOffline,
      force: true,
    });
    expect(fromCache).toBe(true);
    expect(notice).toBe('Exibindo o último catálogo salvo; os vídeos precisam de internet.');
    expect(library.live).toHaveLength(3);
    expect(library.movies).toEqual([]);
  });

  it('falha de rede sem cache lança erro em pt-BR', async () => {
    await expect(
      loadFreeTvLibrary({ storage: new MemoryAdapter(), fetchFn: fetchOffline }),
    ).rejects.toThrow('Verifique a internet');
  });

  it('cache corrompido não conta como cache válido', async () => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, 'corrompido');
    await expect(
      loadFreeTvLibrary({ storage, fetchFn: fetchOffline, force: true }),
    ).rejects.toThrow('Verifique a internet');
  });

  it('sem force, um cache válido é usado sem baixar de novo', async () => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, LISTA);
    const fetchFn = fetchFalso(LISTA_NOVA);
    const { library, fromCache, notice } = await loadFreeTvLibrary({ storage, fetchFn });
    expect(fetchFn).not.toHaveBeenCalled();
    expect(fromCache).toBe(true);
    expect(notice).toContain('último catálogo salvo');
    expect(library.live).toHaveLength(3);
  });

  it('sem force, um cache corrompido é ignorado e a lista é baixada', async () => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, 'corrompido');
    const fetchFn = fetchFalso();
    const { fromCache } = await loadFreeTvLibrary({ storage, fetchFn });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fromCache).toBe(false);
    expect(await storage.get(FREE_TV_CACHE_KEY)).toBe(LISTA);
  });

  it('force ignora o cache, rebaixa a fonte e atualiza o cache', async () => {
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, LISTA);
    const fetchFn = fetchFalso(LISTA_NOVA);
    const { library, fromCache, notice } = await loadFreeTvLibrary({ storage, fetchFn, force: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fromCache).toBe(false);
    expect(notice).toBeNull();
    expect(library.live.map((c) => c.name)).toEqual(['Canal Sem Id']);
    expect(await storage.get(FREE_TV_CACHE_KEY)).toBe(LISTA_NOVA);
  });
});

describe('loadFreeTvLibrary: tempo limite', () => {
  it('interrompe a requisição lenta após 15 segundos', async () => {
    vi.useFakeTimers();
    let sinal: AbortSignal | undefined;
    const fetchLento: PlaylistFetch = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        sinal = signal;
        signal.addEventListener('abort', () => reject(new Error('interrompido')));
      });
    const resultado = expect(
      loadFreeTvLibrary({ storage: new MemoryAdapter(), fetchFn: fetchLento }),
    ).rejects.toThrow('Verifique a internet');
    await vi.advanceTimersByTimeAsync(FREE_TV_TIMEOUT_MS - 1);
    expect(sinal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await resultado;
    expect(sinal?.aborted).toBe(true);
  });

  it('cai para o cache válido quando a requisição estoura o tempo', async () => {
    vi.useFakeTimers();
    const storage = new MemoryAdapter();
    await storage.set(FREE_TV_CACHE_KEY, LISTA);
    const fetchLento: PlaylistFetch = (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('interrompido')));
      });
    const pendente = loadFreeTvLibrary({ storage, fetchFn: fetchLento, force: true });
    await vi.advanceTimersByTimeAsync(FREE_TV_TIMEOUT_MS);
    expect((await pendente).fromCache).toBe(true);
  });
});
