import { DEMO_M3U } from './demo';

/**
 * Contrato entre os apps e o servidor. Nesta fase só existe o mock.
 * Para trocar por Supabase, implemente BackendService e injete a nova instância.
 */

export type DeviceStatusValue = 'trial' | 'active' | 'expired';

export interface M3uPlaylist {
  id: string;
  name: string;
  kind: 'm3u';
  /** Conteúdo bruto do arquivo M3U/M3U8. */
  content?: string;
  /** Link para baixar o arquivo M3U/M3U8. Usado quando não há `content`. Pelo menos um dos dois deve existir. */
  url?: string;
}

export interface XtreamPlaylist {
  id: string;
  name: string;
  kind: 'xtream';
  server: string;
  username: string;
  password: string;
}

export type Playlist = M3uPlaylist | XtreamPlaylist;

export interface DeviceStatus {
  status: DeviceStatusValue;
  /** ISO 8601 */
  expiresAt: string;
  playlists: Playlist[];
}

export interface BackendService {
  getDeviceStatus(mac: string, key: string): Promise<DeviceStatus>;
}

export const TRIAL_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

/** Portal de ativação. Placeholder até o domínio real existir. */
export const ACTIVATION_URL = 'https://brtvplay.app/ativar';

/** Dias restantes até `expiresAt` (arredondado para cima, mínimo 0). */
export function daysLeft(expiresAt: string, now: number = Date.now()): number {
  const ms = Date.parse(expiresAt) - now;
  return Math.max(0, Math.ceil(ms / 86_400_000));
}

/** Playlist de demonstração (ver demo.ts). */
export { DEMO_M3U };

export class MockBackendService implements BackendService {
  private readonly trialStarts = new Map<string, number>();

  constructor(private readonly now: () => number = Date.now) {}

  async getDeviceStatus(mac: string, key: string): Promise<DeviceStatus> {
    const id = `${mac}:${key}`;
    const current = this.now();
    let start = this.trialStarts.get(id);
    if (start === undefined) {
      start = current;
      this.trialStarts.set(id, start);
    }

    const expiresAt = new Date(start + TRIAL_DURATION_MS);
    const expired = current >= expiresAt.getTime();

    return {
      status: expired ? 'expired' : 'trial',
      expiresAt: expiresAt.toISOString(),
      playlists: expired
        ? []
        : [{ id: 'demo', name: 'Demonstração BRTV', kind: 'm3u', content: DEMO_M3U }],
    };
  }
}
