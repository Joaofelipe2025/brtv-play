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
  content: string;
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

/**
 * Playlist de demonstração: só streams HLS públicos de teste da Mux.
 * Nenhum conteúdo comercial. Os grupos exercitam a classificação ao vivo / filmes / séries.
 */
export const DEMO_M3U = `#EXTM3U
#EXTINF:-1 tvg-id="demo.canal1" tvg-name="Canal Demo 1" group-title="Demonstração",Canal Demo 1
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-id="demo.canal2" tvg-name="Canal Demo 2" group-title="Demonstração",Canal Demo 2
https://test-streams.mux.dev/test_001/stream.m3u8
#EXTINF:-1 tvg-id="demo.canal3" tvg-name="Canal Demo 3" group-title="Testes de sinal",Canal Demo 3
https://test-streams.mux.dev/pts_shift/master.m3u8
#EXTINF:-1 tvg-name="Tears of Steel" group-title="Filmes | Demonstração",Tears of Steel
https://test-streams.mux.dev/tos_ismc/main.m3u8
#EXTINF:-1 tvg-name="Big Buck Bunny" group-title="Filmes | Demonstração",Big Buck Bunny
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
#EXTINF:-1 tvg-name="Sinal de Teste" group-title="Filmes | Testes",Sinal de Teste
https://test-streams.mux.dev/test_001/stream.m3u8
#EXTINF:-1 tvg-name="Série Demo S01 E01" group-title="Séries | Demonstração",Série Demo S01 E01 Piloto
https://test-streams.mux.dev/test_001/stream.m3u8
#EXTINF:-1 tvg-name="Série Demo S01 E02" group-title="Séries | Demonstração",Série Demo S01 E02 O Sinal
https://test-streams.mux.dev/pts_shift/master.m3u8
#EXTINF:-1 tvg-name="Série Demo S02 E01" group-title="Séries | Demonstração",Série Demo S02 E01 Recomeço
https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8
`;

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
