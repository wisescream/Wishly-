const EXPANDED_SEARCH_KEY_PREFIX = 'wishly:expanded-retailer-search:v1:';

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): PreferenceStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try { return window.localStorage; }
  catch { return undefined; }
}

export function readExpandedRetailerSearchPreference(
  userId: string,
  storage: PreferenceStorage | undefined = browserStorage(),
): boolean {
  if (!userId || !storage) return false;
  try { return storage.getItem(`${EXPANDED_SEARCH_KEY_PREFIX}${userId}`) === 'true'; }
  catch { return false; }
}

export function writeExpandedRetailerSearchPreference(
  userId: string,
  enabled: boolean,
  storage: PreferenceStorage | undefined = browserStorage(),
): boolean {
  if (!userId || !storage) return false;
  try {
    storage.setItem(`${EXPANDED_SEARCH_KEY_PREFIX}${userId}`, String(enabled));
    return true;
  } catch { return false; }
}
