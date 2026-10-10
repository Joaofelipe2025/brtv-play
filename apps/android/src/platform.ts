import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import type { KeyValueAdapter, LibraryFetch, PlaylistFetch } from '@brtv/core';
import { createAppStore } from '@brtv/core';
import type { Preferences } from './navigation';

/** Adapter sobre AsyncStorage. */
export const asyncAdapter: KeyValueAdapter = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

export const store = createAppStore(asyncAdapter);

/**
 * Fetch com corpo em streaming (o `fetch` do React Native não expõe `body`): o XMLTV é
 * processado aos pedaços em vez de virar uma única string de dezenas de MB.
 */
export const streamingFetch: LibraryFetch = async (url) => {
  const response = await expoFetch(url);
  return {
    ok: response.ok,
    status: response.status,
    json: (): Promise<unknown> => response.json(),
    text: () => response.text(),
    body: response.body,
    headers: response.headers,
  };
};

/**
 * Fetch do catálogo público de testes. Repassa o `signal`: sem isso o tempo limite do core
 * não interromperia o download de fato (o `streamingFetch` acima não recebe `signal`).
 */
export const playlistFetch: PlaylistFetch = async (url, init) => {
  const response = await expoFetch(url, { signal: init.signal });
  return { ok: response.ok, headers: response.headers, text: () => response.text() };
};

const PREFS_KEY ='brtv.prefs.v1';
const defaultPrefs: Preferences = { streamFormat: 'hls' };

export async function loadPreferences(): Promise<Preferences> {
  try {
    const raw = await asyncAdapter.get(PREFS_KEY);
    if (!raw) return defaultPrefs;
    const parsed = JSON.parse(raw) as Partial<Preferences>;
    return { streamFormat: parsed.streamFormat === 'ts' ? 'ts' : 'hls' };
  } catch {
    return defaultPrefs;
  }
}

export async function savePreferences(prefs: Preferences): Promise<void> {
  await asyncAdapter.set(PREFS_KEY, JSON.stringify(prefs));
}
