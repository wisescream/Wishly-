import { describe, expect, it } from 'vitest';
import { readExpandedRetailerSearchPreference, writeExpandedRetailerSearchPreference } from './searchPreferences';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, String(value)); },
    removeItem: (key) => { values.delete(key); },
    clear: () => values.clear(),
    key: (index) => [...values.keys()][index] ?? null,
    get length() { return values.size; },
  };
}

describe('expanded retailer-search preference', () => {
  it('is on by default and persists explicit opt-out per account', () => {
    const storage = memoryStorage();
    expect(readExpandedRetailerSearchPreference('user-a', storage)).toBe(true);
    expect(writeExpandedRetailerSearchPreference('user-a', false, storage)).toBe(true);
    expect(readExpandedRetailerSearchPreference('user-a', storage)).toBe(false);
    expect(writeExpandedRetailerSearchPreference('user-a', true, storage)).toBe(true);
    expect(readExpandedRetailerSearchPreference('user-a', storage)).toBe(true);
    expect(readExpandedRetailerSearchPreference('user-b', storage)).toBe(true);
  });

  it('persists opt-out and safely handles unavailable storage', () => {
    const storage = memoryStorage();
    writeExpandedRetailerSearchPreference('user-a', true, storage);
    writeExpandedRetailerSearchPreference('user-a', false, storage);
    expect(readExpandedRetailerSearchPreference('user-a', storage)).toBe(false);
    expect(readExpandedRetailerSearchPreference('user-a', undefined)).toBe(true);
    expect(writeExpandedRetailerSearchPreference('user-a', true, undefined)).toBe(false);
  });
});
