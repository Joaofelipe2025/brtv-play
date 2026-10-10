import { createContext, useContext } from 'react';
import type { DeviceIdentity, DeviceStatus, EpgIndex, Library, LiveItem, Playlist, StreamFormat } from '@brtv/core';

export interface Preferences {
  streamFormat: StreamFormat;
}

export type Route =
  | { name: 'activation' }
  | { name: 'playlists' }
  | { name: 'addPlaylist' }
  | { name: 'home' }
  | { name: 'live'; category?: string }
  | { name: 'movies'; category?: string }
  | { name: 'series'; category?: string }
  | { name: 'seriesDetail'; seriesId: string }
  | { name: 'settings' }
  | { name: 'about' }
  | {
      name: 'player';
      url: string;
      title: string;
      isLive: boolean;
      /** Id para histórico e posição (VOD e episódios). */
      id?: string;
      /** Lista de canais para CH+/CH- (somente ao vivo). */
      channels?: LiveItem[];
      index?: number;
    };

export interface Session {
  device: DeviceIdentity | null;
  status: DeviceStatus | null;
  playlist: Playlist | null;
  library: Library | null;
  /** Mensagem (pt-BR) quando a lista atual não pôde ser carregada; null se carregou ou ainda não tentou. */
  libraryError: string | null;
  /** true enquanto a biblioteca carrega (mostra estado de carregamento nas telas) */
  loading: boolean;
  epg: EpgIndex;
  prefs: Preferences;
  /** Categorias bloqueadas já liberadas com PIN nesta sessão. */
  unlockedCategories: string[];
  /** Incrementar força o recarregamento da biblioteca. */
  reloadToken: number;
}

export interface AppContextValue {
  session: Session;
  update(patch: Partial<Session>): void;
  /** Abre uma tela nova, empilhando. */
  go(route: Route): void;
  /** Troca a tela atual (sem empilhar). */
  replace(route: Route): void;
  reset(route: Route): void;
  back(): void;
}

export const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp deve ser usado dentro de AppContext');
  return value;
}

/** Nome da categoria virtual de favoritos na TV ao Vivo. */
export const FAVORITES = '__favoritos__';
