import type { StateStorage } from 'zustand/middleware';

/**
 * `window` is absent while Expo Router server-renders (`web.output: "server"`),
 * so storage access stays behind a guard and degrades to memory.
 */
function getLocalStorage(): Storage | null {
  try {
    if (typeof window === 'undefined') {
      return null;
    }
    const probe = '__expense_tracker_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

const local = getLocalStorage();
const memoryFallback = new Map<string, string>();

export const isPersistentStorageAvailable = local !== null;

export const storage: StateStorage = {
  getItem: (name) => local?.getItem(name) ?? memoryFallback.get(name) ?? null,
  setItem: (name, value) => {
    if (local) {
      local.setItem(name, value);
    } else {
      memoryFallback.set(name, value);
    }
  },
  removeItem: (name) => {
    if (local) {
      local.removeItem(name);
    } else {
      memoryFallback.delete(name);
    }
  },
};
