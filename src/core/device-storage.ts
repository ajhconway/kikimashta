/** Optional deployment namespace; the ordinary app retains all existing keys. (#234) */
const namespace = import.meta.env?.VITE_STORAGE_NAMESPACE ?? '';
if (namespace && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(namespace)) throw new Error('Invalid device storage namespace.');
const prefix = namespace ? `kikimashta-scope:${namespace}:` : '';

export const scopedKey = (name: string): string => prefix + name;

/** Expose logical keys so guest-note import cannot scan another deployment's notes. */
export function createDeviceStorage(storage: () => Storage, scope = prefix): Storage {
  const keys = () => {
    const source = storage();
    return Array.from({ length: source.length }, (_, index) => source.key(index))
      .filter((key): key is string => key !== null && key.startsWith(scope))
      .map(key => key.slice(scope.length));
  };
  return {
    get length() { return keys().length; },
    key(index) { return keys()[index] ?? null; },
    getItem(key) { return storage().getItem(scope + key); },
    setItem(key, value) { storage().setItem(scope + key, value); },
    removeItem(key) { storage().removeItem(scope + key); },
    clear() { for (const key of keys()) storage().removeItem(scope + key); },
  };
}

// Access localStorage lazily: unavailable storage is handled by each optional preference.
export const deviceStorage = createDeviceStorage(() => localStorage);
