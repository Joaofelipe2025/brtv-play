import { createStore, type StoreApi } from 'zustand/vanilla';
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
}

export interface AppActions {
  toggleFavorite(id: string): void;
  addHistory(entry: Omit<HistoryEntry, 'watchedAt'>, now?: number): void;
  setPosition(id: string, seconds: number): void;
  setParentalPin(pin: string | null): void;
  verifyPin(pin: string): boolean;
  setCategoryBlocked(category: string, blocked: boolean): void;
  isCategoryBlocked(category: string): boolean;
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
};

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
  }));

  // Persiste após cada mudança de estado (ignora as funções)
  store.subscribe((state) => {
    const { favorites, history, continueWatching, parentalPin, blockedCategories } = state;
    const data: AppState = { favorites, history, continueWatching, parentalPin, blockedCategories };
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
        });
      } catch {
        // Dados corrompidos: mantém o estado inicial
      }
    },
  });
}
