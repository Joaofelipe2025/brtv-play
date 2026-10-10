import type { BackendService, DeviceStatus, M3uPlaylist } from './api';
import { parseM3u, type M3uChannel } from './m3u';
import type { KeyValueAdapter } from './storage';

export const FREE_TV_URL = 'https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8';
export const FREE_TV_CACHE_KEY = 'brtv.free-tv.playlist.v1';
export const FREE_TV_TIMEOUT_MS = 15_000;
const MAX_CONTENT_LENGTH = 5_000_000;

export type PlaylistFetch = (
  url: string,
  init: { signal: AbortSignal },
) => Promise<{
  ok: boolean;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

/** IDs de EPG não são únicos no catálogo. Favoritos usam a identidade da entrada. */
export function parseFreeTvChannels(content: string): M3uChannel[] {
  const occurrences = new Map<string, number>();
  return parseM3u(content).map((channel) => {
    const base = JSON.stringify([channel.tvgId ?? '', channel.group, channel.url]);
    const occurrence = occurrences.get(base) ?? 0;
    occurrences.set(base, occurrence + 1);
    return { ...channel, id: `free-tv:${base}:${occurrence}` };
  });
}

/** Páginas de plataformas não são URLs de mídia para o player nativo. */
export function freeTvPlaybackIssue(url: string): string | null {
  if (/^https?:\/\/(?:[\w-]+\.)?(?:youtube\.com|youtu\.be|twitch\.tv|dailymotion\.com|dai\.ly)(?:[/:?#]|$)/i.test(url)) {
    return 'Este canal usa uma página de vídeo externa e não pode ser aberto diretamente neste player. Escolha outro canal.';
  }
  return null;
}

function validateContent(content: string): void {
  if (content.length > MAX_CONTENT_LENGTH) throw new Error('A lista Free-TV ultrapassou o tamanho permitido.');
  if (!/^#EXTM3U(?:\s|$)/.test(content.trimStart()) || parseM3u(content).length === 0) {
    throw new Error('O Free-TV retornou uma lista inválida ou sem canais.');
  }
}

/** Substitui somente a lista de demonstração; mantém o status do backend existente. */
export class FreeTvBackendService implements BackendService {
  notice: string | null = null;
  private pending: Promise<M3uPlaylist> | null = null;

  constructor(
    private readonly backend: BackendService,
    private readonly storage: KeyValueAdapter,
    private readonly fetchPlaylist: PlaylistFetch = (url, init) => fetch(url, init),
  ) {}

  async getDeviceStatus(mac: string, key: string): Promise<DeviceStatus> {
    const status = await this.backend.getDeviceStatus(mac, key);
    if (status.status === 'expired' || !status.playlists.some((p) => p.id === 'demo')) return status;
    if (!this.pending) this.pending = this.loadPlaylist().finally(() => { this.pending = null; });
    const playlist = await this.pending;
    return { ...status, playlists: status.playlists.map((p) => p.id === 'demo' ? playlist : p) };
  }

  private async loadPlaylist(): Promise<M3uPlaylist> {
    this.notice = null;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FREE_TV_TIMEOUT_MS);
    let content: string;
    try {
      const response = await this.fetchPlaylist(FREE_TV_URL, { signal: controller.signal });
      if (!response.ok) throw new Error('Não foi possível baixar a lista Free-TV.');
      if (Number(response.headers.get('content-length')) > MAX_CONTENT_LENGTH) {
        throw new Error('A lista Free-TV ultrapassou o tamanho permitido.');
      }
      content = await response.text();
      validateContent(content);
      // Falha ao salvar cache não impede abrir um catálogo válido.
      await this.storage.set(FREE_TV_CACHE_KEY, content).catch(() => undefined);
    } catch {
      const cached = await this.storage.get(FREE_TV_CACHE_KEY).catch(() => null);
      try {
        if (!cached) throw new Error('Sem cache');
        validateContent(cached);
      } catch {
        throw new Error('Não foi possível carregar o Free-TV. Verifique a internet. Tentaremos novamente.');
      }
      content = cached;
      this.notice = 'Não foi possível atualizar a lista. Exibindo o último catálogo salvo; os vídeos precisam de internet.';
    } finally {
      clearTimeout(timeout);
    }
    return { id: 'free-tv', name: 'Free-TV · Canais do mundo', kind: 'm3u', content };
  }
}
