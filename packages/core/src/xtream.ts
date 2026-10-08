/**
 * Cliente Xtream Codes (player_api.php). O fetch é injetável para testes.
 */

export type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface XtreamCredentials {
  /** Ex.: http://servidor.exemplo:8080 (sem barra final) */
  server: string;
  username: string;
  password: string;
}

export interface XtreamUserInfo {
  auth: number;
  status?: string;
  exp_date?: string;
  max_connections?: string;
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
}

export interface XtreamLiveStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id: string;
  epg_channel_id?: string;
}

export interface XtreamVodStream {
  stream_id: number;
  name: string;
  stream_icon?: string;
  category_id: string;
  container_extension?: string;
  rating?: string;
}

export interface XtreamSeries {
  series_id: number;
  name: string;
  cover?: string;
  category_id: string;
  plot?: string;
}

export interface XtreamEpisode {
  id: string;
  episode_num: number;
  title: string;
  container_extension?: string;
}

export interface XtreamSeriesInfo {
  /** Episódios agrupados por número da temporada (chave em string). */
  episodes: Record<string, XtreamEpisode[]>;
}

export class XtreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XtreamError';
  }
}

export class XtreamClient {
  private readonly base: string;

  constructor(
    private readonly creds: XtreamCredentials,
    private readonly fetchFn: FetchLike = (url) => fetch(url),
  ) {
    this.base = creds.server.replace(/\/+$/, '');
  }

  private apiUrl(action?: string, params: Record<string, string | number> = {}): string {
    const query = new URLSearchParams({
      username: this.creds.username,
      password: this.creds.password,
    });
    if (action) query.set('action', action);
    for (const [k, v] of Object.entries(params)) query.set(k, String(v));
    return `${this.base}/player_api.php?${query.toString()}`;
  }

  private async call<T>(action?: string, params?: Record<string, string | number>): Promise<T> {
    const response = await this.fetchFn(this.apiUrl(action, params));
    if (!response.ok) {
      throw new XtreamError(`Falha HTTP ${response.status} ao chamar ${action ?? 'auth'}`);
    }
    return (await response.json()) as T;
  }

  async authenticate(): Promise<XtreamUserInfo> {
    const data = await this.call<{ user_info?: XtreamUserInfo }>();
    if (!data.user_info || data.user_info.auth !== 1) {
      throw new XtreamError('Credenciais inválidas');
    }
    return data.user_info;
  }

  getLiveCategories(): Promise<XtreamCategory[]> {
    return this.call<XtreamCategory[]>('get_live_categories');
  }

  getLiveStreams(categoryId?: string): Promise<XtreamLiveStream[]> {
    return this.call<XtreamLiveStream[]>(
      'get_live_streams',
      categoryId !== undefined ? { category_id: categoryId } : {},
    );
  }

  getVodCategories(): Promise<XtreamCategory[]> {
    return this.call<XtreamCategory[]>('get_vod_categories');
  }

  getVodStreams(categoryId?: string): Promise<XtreamVodStream[]> {
    return this.call<XtreamVodStream[]>(
      'get_vod_streams',
      categoryId !== undefined ? { category_id: categoryId } : {},
    );
  }

  getSeriesCategories(): Promise<XtreamCategory[]> {
    return this.call<XtreamCategory[]>('get_series_categories');
  }

  getSeries(categoryId?: string): Promise<XtreamSeries[]> {
    return this.call<XtreamSeries[]>(
      'get_series',
      categoryId !== undefined ? { category_id: categoryId } : {},
    );
  }

  getSeriesInfo(seriesId: number): Promise<XtreamSeriesInfo> {
    return this.call<XtreamSeriesInfo>('get_series_info', { series_id: seriesId });
  }

  liveStreamUrl(streamId: number, ext: 'ts' | 'm3u8' = 'm3u8'): string {
    return `${this.base}/live/${this.creds.username}/${this.creds.password}/${streamId}.${ext}`;
  }

  vodStreamUrl(streamId: number, ext = 'mp4'): string {
    return `${this.base}/movie/${this.creds.username}/${this.creds.password}/${streamId}.${ext}`;
  }

  episodeStreamUrl(episodeId: string, ext = 'mp4'): string {
    return `${this.base}/series/${this.creds.username}/${this.creds.password}/${episodeId}.${ext}`;
  }
}
