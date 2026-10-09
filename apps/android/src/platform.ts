import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetch as expoFetch } from 'expo/fetch';
import type { KeyValueAdapter, LibraryFetch } from '@brtv/core';
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

const PREFS_KEY = 'brtv.prefs.v1';
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
