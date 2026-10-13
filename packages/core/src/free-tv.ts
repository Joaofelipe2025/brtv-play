import type { M3uPlaylist } from './api';
import type { Library } from './library';
import { parseM3u, type M3uChannel } from './m3u';
import type { KeyValueAdapter } from './storage';

/**
 * Catálogo público de testes: playlist comunitária Free-TV/IPTV, usada como lista separada
 * (não substitui a demonstração nem as listas do usuário) e que alimenta só a TV ao Vivo.
 * A licença é a do repositório de origem; consulte-o antes de redistribuir. Sem credenciais.
 */
export const FREE_TV_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';
export const FREE_TV_PLAYLIST_ID = 'free-tv';
export const FREE_TV_CACHE_KEY = 'brtv.free-tv.playlist.v1';
export const FREE_TV_TIMEOUT_MS = 15_000;
/** Limite de tamanho do conteúdo (caracteres e `content-length`), para não estourar a memória do aparelho. */
const MAX_CONTENT_LENGTH = 5_000_000;

/** Procedência da lista, documentada no código e em `docs/FREE-TV.md`. */
export const FREE_TV_SOURCE = {
  repo: 'https://github.com/Free-TV/IPTV',
  descricao: 'Playlist comunitária de canais gratuitos e oficiais (FAST, TV aberta). Sem canais pagos.',
  url: FREE_TV_URL,
} as const;

/** Entrada que faz o catálogo aparecer entre as listas disponíveis. */
export const FREE_TV_PLAYLIST: M3uPlaylist = {
  id: FREE_TV_PLAYLIST_ID,
  name: 'Catálogo público de testes',
  kind: 'm3u',
  url: FREE_TV_URL,
};

const CACHE_NOTICE = 'Exibindo o último catálogo salvo; os vídeos precisam de internet.';
const LOAD_ERROR = 'Não foi possível carregar o catálogo público de testes. Verifique a internet e tente novamente.';
const TOO_LARGE_ERROR = 'A lista do catálogo público ultrapassou o tamanho permitido.';
const INVALID_ERROR = 'O catálogo público retornou uma lista inválida ou sem canais.';
const PLAYBACK_ISSUE =
  'Este canal usa uma página de vídeo externa e não pode ser aberto diretamente neste player. Escolha outro canal.';

/**
 * Fetch mínimo, estrutural: compatível com `globalThis.fetch`, com `expo/fetch` e com fakes de teste.
 * O `signal` permite interromper a requisição no tempo limite.
 */
export type PlaylistFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/** O fetch global é resolvido na chamada (pode não existir quando o módulo é carregado). */
const defaultFetch: PlaylistFetch = (url, init) => globalThis.fetch(url, init);

/**
 * Faz o parse da lista dando um id único a cada entrada: os ids de EPG (`tvg-id`) se repetem no
 * catálogo, e favoritos precisam da identidade da entrada. O id deriva de tvg-id, grupo e link
 * (estável se a ordem mudar) mais a ocorrência, para entradas idênticas.
 */
export function parseFreeTvChannels(content: string): M3uChannel[] {
  const occurrences = new Map<string, number>();
  return parseM3u(content).map((channel) => {
    const base = JSON.stringify([channel.tvgId ?? '', channel.group, channel.url]);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { ...channel, id: `free-tv:${base}:${occurrence}` };
  });
}

/** Páginas de vídeo de plataformas não são URLs de mídia para o player nativo; devolve o aviso ou `null`. */
export function freeTvPlaybackIssue(url: string): string | null {
  const page = /^https?:\/\/(?:[\w-]+\.)*(?:youtube\.com|youtu\.be|twitch\.tv|dailymotion\.com|dai\.ly)(?:[/:?#]|$)/i;
  return page.test(url) ? PLAYBACK_ISSUE : null;
}

/** Valida o conteúdo (tamanho, cabeçalho #EXTM3U e ao menos um canal) e devolve os canais já com ids únicos. */
function parseValidContent(content: string): M3uChannel[] {
  if (content.length > MAX_CONTENT_LENGTH) throw new Error(TOO_LARGE_ERROR);
  if (!/^#EXTM3U(?:\s|$)/.test(content.trimStart())) throw new Error(INVALID_ERROR);
  const channels = parseFreeTvChannels(content);
  if (channels.length === 0) throw new Error(INVALID_ERROR);
  return channels;
}

/** Lê o cache; qualquer falha de leitura ou conteúdo inválido conta como "sem cache". */
async function readCache(storage: KeyValueAdapter): Promise<{ content: string; channels: M3uChannel[] } | null> {
  try {
    const content = await storage.get(FREE_TV_CACHE_KEY);
    if (content === null) return null;
    return { content, channels: parseValidContent(content) };
  } catch {
    return null;
  }
}

/** Baixa a lista com tempo limite e valida; só devolve conteúdo aceito. */
async function download(fetchFn: PlaylistFetch): Promise<{ content: string; channels: M3uChannel[] }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FREE_TV_TIMEOUT_MS);
  try {
    const response = await fetchFn(FREE_TV_URL, { signal: controller.signal });
    if (!response.ok) throw new Error('Não foi possível baixar a lista do catálogo público.');
    if (Number(response.headers.get('content-length')) > MAX_CONTENT_LENGTH) throw new Error(TOO_LARGE_ERROR);
    const content = await response.text();
    return { content, channels: parseValidContent(content) };
  } finally {
    clearTimeout(timer);
  }
}

/** Monta a biblioteca: só TV ao Vivo. Nomes de filme/série da lista pública não viram VOD. */
function toLibrary(channels: M3uChannel[]): Library {
  return {
    live: channels.map((c) => ({
      id: c.id,
      name: c.name,
      group: c.group,
      url: c.url,
      ...(c.tvgLogo !== undefined ? { logo: c.tvgLogo } : {}),
      ...(c.tvgId !== undefined ? { epgId: c.tvgId } : {}),
    })),
    movies: [],
    series: [],
    xtream: null,
    epgUrl: null,
  };
}

export interface LoadFreeTvOptions {
  storage: KeyValueAdapter;
  fetchFn?: PlaylistFetch;
  /**
   * Aceito para o "Recarregar lista", mas sem efeito: seleção e recarregar seguem o mesmo fluxo
   * (rede primeiro, cache só como socorro se a rede falhar).
   */
  force?: boolean;
}

export interface LoadFreeTvResult {
  library: Library;
  fromCache: boolean;
  /** Aviso para o usuário quando a lista veio do cache. */
  notice: string | null;
}

/**
 * Carrega o catálogo público de testes: sempre tenta a rede primeiro (com tempo limite) e, se o conteúdo
 * baixado for válido, salva-o no cache. O cache é só socorro: se o download falhar (rede, tempo limite,
 * lista inválida), devolve o último catálogo salvo revalidado, com aviso. Sem cache válido, lança um
 * `Error` com mensagem em pt-BR.
 */
export async function loadFreeTvLibrary(options: LoadFreeTvOptions): Promise<LoadFreeTvResult> {
  const { storage, fetchFn = defaultFetch } = options;

  let fresh: { content: string; channels: M3uChannel[] };
  try {
    fresh = await download(fetchFn);
  } catch {
    const cached = await readCache(storage);
    if (cached) return { library: toLibrary(cached.channels), fromCache: true, notice: CACHE_NOTICE };
    throw new Error(LOAD_ERROR);
  }
  try {
    await storage.set(FREE_TV_CACHE_KEY, fresh.content);
  } catch {
    // Falha ao salvar o cache não impede abrir um catálogo válido.
  }
  return { library: toLibrary(fresh.channels), fromCache: false, notice: null };
}
