import AsyncStorage from '@react-native-async-storage/async-storage';
import type { KeyValueAdapter } from '@brtv/core';
import { createAppStore } from '@brtv/core';

/** Adapter sobre AsyncStorage. */
export const asyncAdapter: KeyValueAdapter = {
  get: (key) => AsyncStorage.getItem(key),
  set: (key, value) => AsyncStorage.setItem(key, value),
  remove: (key) => AsyncStorage.removeItem(key),
};

export const store = createAppStore(asyncAdapter);
