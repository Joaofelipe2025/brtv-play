import { createStore, type StoreApi } from 'zustand/vanilla';
import type { Playlist } from './api';
import type { KeyValueAdapter } from './storage';

export interface HistoryEntry {
  id: string;
  type: 'live' | 'vod' | 'series';
  title: string;
  watchedAt: number;
}

export interface AppState {
  favorites: string[];
  history: HistoryEntry[];
  /** Posição em segundos por id de conteúdo VOD/episódio. */
  continueWatching: Record<string, number>;
  /** PIN parental de 4 dígitos. Armazenamento local, não é barreira de segurança. */
  parentalPin: string | null;
  blockedCategories: string[];
  /** Listas cadastradas pela pessoa neste aparelho (Xtream ou link M3U). */
  userPlaylists: Playlist[];
}

export interface AppActions {
  toggleFavorite(id: string): void;
  addHistory(entry: Omit<HistoryEntry, 'watchedAt'>, now?: number): void;
  setPosition(id: string, seconds: number): void;
  setParentalPin(pin: string | null): void;
  verifyPin(pin: string): boolean;
  setCategoryBlocked(category: string, blocked: boolean): void;
  isCategoryBlocked(category: string): boolean;
  /** Adiciona a lista; se já existir uma com o mesmo id, substitui no mesmo lugar. */
  addUserPlaylist(playlist: Playlist): void;
  removeUserPlaylist(id: string): void;
}

export type AppStore = AppState & AppActions;

export const STORE_STORAGE_KEY = 'brtv.store.v1';
const MAX_HISTORY = 100;
const PIN_PATTERN = /^\d{4}$/;

export const initialState: AppState = {
  favorites: [],
  history: [],
  continueWatching: {},
  parentalPin: null,
  blockedCategories: [],
  userPlaylists: [],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Confere se um item lido do armazenamento tem a forma de uma `Playlist` utilizável. */
function isStoredPlaylist(value: unknown): value is Playlist {
  if (!isRecord(value)) return false;
  if (typeof value['id'] !== 'string' || typeof value['name'] !== 'string') return false;
  if (value['kind'] === 'xtream') {
    return (
      typeof value['server'] === 'string' &&
      typeof value['username'] === 'string' &&
      typeof value['password'] === 'string'
    );
  }
  if (value['kind'] === 'm3u') {
    return typeof value['content'] === 'string' || typeof value['url'] === 'string';
  }
  return false;
}

/**
 * Cria a store e persiste cada mudança pelo adapter.
 * Use `hydrate` na inicialização para carregar o estado salvo.
 */
export function createAppStore(adapter: KeyValueAdapter): StoreApi<AppStore> & {
  hydrate(): Promise<void>;
} {
  const store = createStore<AppStore>()((set, get) => ({
    ...initialState,

    toggleFavorite(id) {
      const favorites = get().favorites.includes(id)
        ? get().favorites.filter((f) => f !== id)
        : [...get().favorites, id];
      set({ favorites });
    },

    addHistory(entry, now = Date.now()) {
      const history = [
        { ...entry, watchedAt: now },
        ...get().history.filter((h) => h.id !== entry.id),
      ].slice(0, MAX_HISTORY);
      set({ history });
    },

    setPosition(id, seconds) {
      if (!Number.isFinite(seconds) || seconds < 0) return;
      set({ continueWatching: { ...get().continueWatching, [id]: Math.floor(seconds) } });
    },

    setParentalPin(pin) {
      if (pin !== null && !PIN_PATTERN.test(pin)) {
        throw new Error('PIN deve ter exatamente 4 dígitos');
      }
      set({ parentalPin: pin });
    },

    verifyPin(pin) {
      const current = get().parentalPin;
      return current !== null && current === pin;
    },

    setCategoryBlocked(category, blocked) {
      const current = get().blockedCategories.filter((c) => c !== category);
      set({ blockedCategories: blocked ? [...current, category] : current });
    },

    isCategoryBlocked(category) {
      return get().blockedCategories.includes(category);
    },

    addUserPlaylist(playlist) {
      const current = get().userPlaylists;
      const exists = current.some((p) => p.id === playlist.id);
      set({
        userPlaylists: exists
          ? current.map((p) => (p.id === playlist.id ? playlist : p))
          : [...current, playlist],
      });
    },

    removeUserPlaylist(id) {
      set({ userPlaylists: get().userPlaylists.filter((p) => p.id !== id) });
    },
  }));

  // Persiste após cada mudança de estado (ignora as funções)
  store.subscribe((state) => {
    const { favorites, history, continueWatching, parentalPin, blockedCategories, userPlaylists } =
      state;
    const data: AppState = {
      favorites,
      history,
      continueWatching,
      parentalPin,
      blockedCategories,
      userPlaylists,
    };
    void adapter.set(STORE_STORAGE_KEY, JSON.stringify(data));
  });

  return Object.assign(store, {
    async hydrate(): Promise<void> {
      const raw = await adapter.get(STORE_STORAGE_KEY);
      if (!raw) return;
      try {
        const parsed = JSON.parse(raw) as Partial<AppState>;
        store.setState({
          favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
          history: Array.isArray(parsed.history) ? parsed.history : [],
          continueWatching:
            parsed.continueWatching && typeof parsed.continueWatching === 'object'
              ? parsed.continueWatching
              : {},
          parentalPin: typeof parsed.parentalPin === 'string' ? parsed.parentalPin : null,
          blockedCategories: Array.isArray(parsed.blockedCategories)
            ? parsed.blockedCategories
            : [],
          // Descarta itens sem a forma de uma lista, para um registro ruim não derrubar o app.
          userPlaylists: Array.isArray(parsed.userPlaylists)
            ? (parsed.userPlaylists as unknown[]).filter(isStoredPlaylist)
            : [],
        });
      } catch {
        // Dados corrompidos: mantém o estado inicial
      }
    },
  });
}
