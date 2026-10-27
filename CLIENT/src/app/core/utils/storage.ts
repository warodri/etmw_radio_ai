function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readStorage(key: string): string | null {
  try {
    return storage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    storage()?.setItem(key, value);
  } catch {
    // Storage can be unavailable (private mode); the session still works in memory.
  }
}

export function removeStorage(key: string): void {
  try {
    storage()?.removeItem(key);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}
