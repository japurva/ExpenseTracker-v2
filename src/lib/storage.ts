import type { StateStorage } from 'zustand/middleware';

const MMKV_ID = 'expense-tracker';

type MMKVInstance = {
  getString: (key: string) => string | undefined;
  set: (key: string, value: string) => void;
  remove: (key: string) => void;
};

/**
 * MMKV is a Nitro module, so a client built before the dependency existed throws
 * while `react-native-mmkv` itself is being evaluated. Requiring it lazily keeps
 * that failure inside this call instead of taking down every module that imports
 * the store.
 */
function loadMMKV(): MMKVInstance | null {
  try {
    const { createMMKV } = require('react-native-mmkv') as typeof import('react-native-mmkv');
    return createMMKV({ id: MMKV_ID });
  } catch (error) {
    console.warn(
      '[storage] MMKV unavailable — falling back to AsyncStorage. ' +
        'Rebuild the development client to enable MMKV.',
      error,
    );
    return null;
  }
}

function loadAsyncStorage(): StateStorage | null {
  try {
    const asyncStorage = (
      require('@react-native-async-storage/async-storage') as typeof import('@react-native-async-storage/async-storage')
    ).default;

    return {
      getItem: (name) => asyncStorage.getItem(name),
      setItem: (name, value) => asyncStorage.setItem(name, value),
      removeItem: (name) => asyncStorage.removeItem(name),
    };
  } catch (error) {
    console.warn(
      '[storage] AsyncStorage unavailable — running on in-memory storage for this session.',
      error,
    );
    return null;
  }
}

const mmkv = loadMMKV();
const asyncStorage = mmkv ? null : loadAsyncStorage();

const memoryFallback = new Map<string, string>();

const memoryStorage: StateStorage = {
  getItem: (name) => memoryFallback.get(name) ?? null,
  setItem: (name, value) => {
    memoryFallback.set(name, value);
  },
  removeItem: (name) => {
    memoryFallback.delete(name);
  },
};

const mmkvStorage: StateStorage | null = mmkv
  ? {
      getItem: (name) => mmkv.getString(name) ?? null,
      setItem: (name, value) => {
        mmkv.set(name, value);
      },
      removeItem: (name) => {
        mmkv.remove(name);
      },
    }
  : null;

export const isPersistentStorageAvailable = mmkvStorage !== null || asyncStorage !== null;

export const storage: StateStorage = mmkvStorage ?? asyncStorage ?? memoryStorage;
