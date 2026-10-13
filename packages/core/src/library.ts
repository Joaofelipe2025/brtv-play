import { parseXmltvStream, type EpgIndex } from './epg';
import { classifyM3u, parseM3u } from './m3u';
import { XtreamClient } from './xtream';
import type { Playlist } from './api';

/** Formato do stream ao vivo no Xtream. */
export type StreamFormat = 'hls' | 'ts';

/** Leitor mínimo de um corpo de resposta em streaming (compatível com `ReadableStream`). */
export interface BodyReader {
  read(): Promise<{ done: boolean; value?: Uint8Array }>;
}

/**
 * Fetch mínimo, estrutural: compatível com `globalThis.fetch` e com fakes de teste.
 * `body` pode não existir (React Native), caso em que `text()` é usado.
 */
export type LibraryFetch = (url: string) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  body?: { getReader(): BodyReader } | null;
  headers?: { get(name: string): string | null };
}>;

/** Sem streaming, um XMLTV acima disto (lido como uma única string) derruba TV Box com pouca RAM. */
export const EPG_MAX_UNSTREAMED_BYTES = 60 * 1024 * 1024;

/** TextDecoder existe em todos os runtimes alvo; declarado aqui porque o tsconfig do Android não traz a lib DOM. */
declare const TextDecoder: new () => { decode(input?: Uint8Array, options?: { stream?: boolean }): string };

/** Resolve o fetch padrão em tempo de chamada (pode não existir na carga do módulo). */
function defaultFetch(): LibraryFetch {
  return (url) => globalThis.fetch(url) as ReturnType<LibraryFetch>;
}

export interface LiveItem {
  id: string;
  name: string;
  group: string;
  url: string;
  logo?: string;
  epgId?: string;
}

export interface VodItem {
  id: string;
  name: string;
  group: string;
  url: string;
  poster?: string;
}

export interface EpisodeItem {
  id: string;
  season: number;
  episode: number;
  title: string;
  url: string;
}

export interface SeriesEntry {
  id: string;
  name: string;
  group: string;
  cover?: string;
  plot?: string;
  /** M3U: episódios já conhecidos. Xtream: carregados sob demanda via `xtreamId`. */
  seasons?: Record<string, EpisodeItem[]>;
  xtreamId?: number;
}

export interface Library {
  live: LiveItem[];
  movies: VodItem[];
  series: SeriesEntry[];
  xtream: XtreamClient | null;
  epgUrl: string | null;
}

function groupName(id: string, names: Map<string, string>): string {
  return names.get(id) ?? 'Sem categoria';
}

/** Remove o prefixo "Filmes | " / "Séries | " para exibir só a categoria. */
export function cleanGroup(group: string): string {
  return group.replace(/^\s*(filmes?|movies?|vod|s[ée]ries|series|tv shows?)\s*[|:/-]\s*/i, '') || group;
}

/** Baixa o texto de uma lista M3U por link. */
async function downloadM3u(url: string, fetchFn: LibraryFetch): Promise<string> {
  const response = await fetchFn(url);
  if (!response.ok) throw new Error(`Falha ao baixar a lista (HTTP ${response.status})`);
  return response.text();
}

/** Monta a biblioteca de uma playlist (M3U direto, M3U por link ou Xtream via API). */
export async function loadLibrary(
  playlist: Playlist,
  format: StreamFormat,
  fetchFn: LibraryFetch = defaultFetch(),
): Promise<Library> {
  if (playlist.kind === 'm3u') {
    // O conteúdo embutido tem prioridade; o link só é baixado quando não há conteúdo.
    let text = playlist.content;
    if (text === undefined) {
      if (!playlist.url) throw new Error('A lista M3U não tem conteúdo nem link.');
      text = await downloadM3u(playlist.url, fetchFn);
    }
    const { live, movies, series } = classifyM3u(parseM3u(text));
    return {
      live: live.map((c) => ({
        id: c.id,
        name: c.name,
        group: c.group,
        url: c.url,
        ...(c.tvgLogo !== undefined ? { logo: c.tvgLogo } : {}),
        ...(c.tvgId !== undefined ? { epgId: c.tvgId } : {}),
      })),
      movies: movies.map((m) => ({
        id: `vod-${m.id}`,
        name: m.name,
        group: cleanGroup(m.group),
        url: m.url,
        ...(m.tvgLogo !== undefined ? { poster: m.tvgLogo } : {}),
      })),
      series: series.map((s) => ({
        id: s.id,
        name: s.name,
        group: cleanGroup(s.group),
        ...(s.logo !== undefined ? { cover: s.logo } : {}),
        seasons: s.seasons,
      })),
      xtream: null,
      epgUrl: null,
    };
  }

  const client = new XtreamClient(
    {
      server: playlist.server,
      username: playlist.username,
      password: playlist.password,
    },
    fetchFn,
  );
  await client.authenticate();

  const [liveCats, liveStreams, vodCats, vodStreams, seriesCats, series] = await Promise.all([
    client.getLiveCategories(),
    client.getLiveStreams(),
    client.getVodCategories(),
    client.getVodStreams(),
    client.getSeriesCategories(),
    client.getSeries(),
  ]);

  const liveNames = new Map(liveCats.map((c) => [c.category_id, c.category_name]));
  const vodNames = new Map(vodCats.map((c) => [c.category_id, c.category_name]));
  const seriesNames = new Map(seriesCats.map((c) => [c.category_id, c.category_name]));

  const ext = format === 'ts' ? 'ts' : 'm3u8';
  const base = playlist.server.replace(/\/+$/, '');
  const epgUrl = `${base}/xmltv.php?username=${encodeURIComponent(playlist.username)}&password=${encodeURIComponent(playlist.password)}`;

  return {
    live: liveStreams.map((s) => ({
      id: String(s.stream_id),
      name: s.name,
      group: groupName(s.category_id, liveNames),
      url: client.liveStreamUrl(s.stream_id, ext),
      ...(s.stream_icon ? { logo: s.stream_icon } : {}),
      ...(s.epg_channel_id ? { epgId: s.epg_channel_id } : {}),
    })),
    movies: vodStreams.map((v) => ({
      id: `vod-${v.stream_id}`,
      name: v.name,
      group: groupName(v.category_id, vodNames),
      url: client.vodStreamUrl(v.stream_id, v.container_extension ?? 'mp4'),
      ...(v.stream_icon ? { poster: v.stream_icon } : {}),
    })),
    series: series.map((s) => ({
      id: `xseries-${s.series_id}`,
      name: s.name,
      group: groupName(s.category_id, seriesNames),
      xtreamId: s.series_id,
      ...(s.cover ? { cover: s.cover } : {}),
      ...(s.plot ? { plot: s.plot } : {}),
    })),
    xtream: client,
    epgUrl,
  };
}

/** Temporadas de uma série: direto do M3U ou buscadas na API Xtream. */
export async function loadSeasons(
  library: Library,
  entry: SeriesEntry,
): Promise<Record<string, EpisodeItem[]>> {
  if (entry.seasons) return entry.seasons;
  const client = library.xtream;
  if (!client || entry.xtreamId === undefined) return {};
  const info = await client.getSeriesInfo(entry.xtreamId);
  const result: Record<string, EpisodeItem[]> = {};
  for (const [season, episodes] of Object.entries(info.episodes)) {
    result[season] = episodes.map((ep) => ({
      id: `ep-${ep.id}`,
      season: Number(season),
      episode: ep.episode_num,
      title: ep.title,
      url: client.episodeStreamUrl(ep.id, ep.container_extension ?? 'mp4'),
    }));
  }
  return result;
}

/** Baixa e indexa o XMLTV. Falhas retornam índice vazio. */
export async function loadEpg(
  url: string | null,
  fetchFn: LibraryFetch = defaultFetch(),
): Promise<EpgIndex> {
  if (!url) return new Map();
  try {
    const response = await fetchFn(url);
    if (!response.ok) return new Map();
    const body = response.body;
    if (!body) {
      // Sem `body` (fetch do React Native): lê tudo como um único chunk, se couber na memória.
      const length = Number(response.headers?.get('content-length') ?? '');
      if (Number.isFinite(length) && length > EPG_MAX_UNSTREAMED_BYTES) return new Map();
      const text = await response.text();
      return await parseXmltvStream(singleChunk(text));
    }
    const reader = body.getReader();
    const decoder = new TextDecoder();
    async function* chunks(): AsyncGenerator<string> {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) yield decoder.decode(value, { stream: true });
      }
    }
    return await parseXmltvStream(chunks());
  } catch {
    return new Map();
  }
}

async function* singleChunk(text: string): AsyncGenerator<string> {
  yield text;
}
