export interface M3uChannel {
  id: string;
  name: string;
  url: string;
  tvgId?: string;
  tvgName?: string;
  tvgLogo?: string;
  group: string;
}

/** Extrai pares atributo="valor" de uma linha #EXTINF. */
function parseAttributes(attrs: string): Record<string, string> {
  const result: Record<string, string> = {};
  const pattern = /([\w-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(attrs)) !== null) {
    const [, name, value] = match;
    if (name !== undefined && value !== undefined) {
      result[name] = value;
    }
  }
  return result;
}

/**
 * Separa a parte de atributos do nome do canal: a vírgula que importa é a primeira
 * fora de aspas, então nomes com vírgula dentro de atributos não quebram o parser.
 */
function splitInfo(info: string): { attrs: string; name: string } {
  let inQuotes = false;
  for (let i = 0; i < info.length; i++) {
    const ch = info[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) {
      return { attrs: info.slice(0, i), name: info.slice(i + 1).trim() };
    }
  }
  return { attrs: info, name: '' };
}

export interface M3uEpisode {
  id: string;
  season: number;
  episode: number;
  title: string;
  url: string;
}

export interface M3uSeries {
  id: string;
  name: string;
  group: string;
  logo?: string;
  /** Episódios por número da temporada (chave em string, como no Xtream). */
  seasons: Record<string, M3uEpisode[]>;
}

export interface M3uLibrary {
  live: M3uChannel[];
  movies: M3uChannel[];
  series: M3uSeries[];
}

const VOD_EXTENSION = /\.(mp4|mkv|avi|mov|m4v|webm)(\?|$)/i;
const MOVIE_GROUP = /^\s*(filmes?|movies?|vod)\b/i;
const SERIES_GROUP = /^\s*(s[ée]ries|series|tv shows?)\b/i;
/** "Nome S01 E02", "Nome S1E2", "Nome - S01E02 - Título" */
const EPISODE_PATTERN = /^(.*?)[\s._-]*S(\d{1,2})\s*E(\d{1,3})\b(.*)$/i;

/**
 * Separa uma lista M3U em ao vivo, filmes e séries, seguindo convenções comuns:
 * caminhos /movie/ e /series/ (M3U gerado por Xtream), extensões de arquivo de vídeo,
 * grupos "Filmes | ..." e "Séries | ..." e nomes com SxxExx.
 * Itens de série sem SxxExx viram filmes, para não sumirem da lista.
 */
export function classifyM3u(channels: M3uChannel[]): M3uLibrary {
  const live: M3uChannel[] = [];
  const movies: M3uChannel[] = [];
  const seriesMap = new Map<string, M3uSeries>();

  for (const ch of channels) {
    const episode = EPISODE_PATTERN.exec(ch.name);
    const looksSeries = /\/series\//i.test(ch.url) || SERIES_GROUP.test(ch.group);
    const looksMovie =
      /\/movie\//i.test(ch.url) || VOD_EXTENSION.test(ch.url) || MOVIE_GROUP.test(ch.group);

    if ((looksSeries || looksMovie) && episode) {
      const [, rawName = '', s = '1', e = '1', rest = ''] = episode;
      const name = rawName.trim() || ch.name;
      const key = `${ch.group}::${name.toLowerCase()}`;
      let series = seriesMap.get(key);
      if (!series) {
        series = {
          id: `m3u-series-${seriesMap.size}`,
          name,
          group: ch.group,
          ...(ch.tvgLogo !== undefined ? { logo: ch.tvgLogo } : {}),
          seasons: {},
        };
        seriesMap.set(key, series);
      }
      const season = Number(s);
      const list = series.seasons[String(season)] ?? [];
      const title = rest.replace(/^[\s.:_-]+/, '').trim();
      list.push({
        id: ch.id,
        season,
        episode: Number(e),
        title: title || `Episódio ${Number(e)}`,
        url: ch.url,
      });
      series.seasons[String(season)] = list;
      continue;
    }

    if (looksSeries || looksMovie) movies.push(ch);
    else live.push(ch);
  }

  for (const series of seriesMap.values()) {
    for (const list of Object.values(series.seasons)) {
      list.sort((a, b) => a.episode - b.episode);
    }
  }

  return { live, movies, series: Array.from(seriesMap.values()) };
}

/**
 * Parser de M3U/M3U8. Ignora entradas sem URL e linhas desconhecidas.
 * Não lança erro para conteúdo malformado: retorna os canais válidos encontrados.
 */
export function parseM3u(content: string): M3uChannel[] {
  const lines = content.split(/\r?\n/);
  const channels: M3uChannel[] = [];
  let pending: { attrs: Record<string, string>; name: string } | null = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (line === '') continue;

    if (line.startsWith('#EXTINF')) {
      const info = line.slice('#EXTINF'.length).replace(/^:/, '');
      const { attrs, name } = splitInfo(info);
      pending = { attrs: parseAttributes(attrs), name };
      continue;
    }

    if (line.startsWith('#')) continue;

    if (/^https?:\/\//i.test(line) || /^rtmp:\/\//i.test(line) || /^udp:\/\//i.test(line)) {
      const attrs = pending?.attrs ?? {};
      const name = pending?.name || attrs['tvg-name'] || line;
      const index = channels.length;
      const tvgId = attrs['tvg-id'] || undefined;
      const tvgName = attrs['tvg-name'] || undefined;
      const tvgLogo = attrs['tvg-logo'] || undefined;
      channels.push({
        id: tvgId ?? `ch-${index}`,
        name,
        url: line,
        ...(tvgId !== undefined ? { tvgId } : {}),
        ...(tvgName !== undefined ? { tvgName } : {}),
        ...(tvgLogo !== undefined ? { tvgLogo } : {}),
        group: attrs['group-title'] || 'Sem grupo',
      });
      pending = null;
    }
  }

  return channels;
}
