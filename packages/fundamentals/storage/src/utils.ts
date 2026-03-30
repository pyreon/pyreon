import type { StorageOptions } from "./types";

// ─── SSR Detection ───────────────────────────────────────────────────────────

/**
 * Check if we're running in a browser environment.
 */
export function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof document !== "undefined";
}

// ─── Serialization ───────────────────────────────────────────────────────────

/**
 * Serialize a value to a string for storage.
 */
export function serialize<T>(value: T, serializer?: StorageOptions<T>["serializer"]): string {
  if (serializer) return serializer(value);
  return JSON.stringify(value);
}

/**
 * Deserialize a raw string from storage back to a typed value.
 * Returns the default value if deserialization fails.
 */
export function deserialize<T>(
  raw: string,
  defaultValue: T,
  deserializer?: StorageOptions<T>["deserializer"],
  onError?: StorageOptions<T>["onError"],
): T {
  try {
    if (deserializer) return deserializer(raw);
    return JSON.parse(raw) as T;
  } catch (e) {
    if (onError) {
      const result = onError(e as Error);
      return result !== undefined ? result : defaultValue;
    }
    return defaultValue;
  }
}

// ─── Safe Storage Access ─────────────────────────────────────────────────────

/**
 * Safely get a Web Storage instance (localStorage or sessionStorage).
 * Returns null if not available (SSR, security restrictions, etc.).
 */
export function getWebStorage(type: "local" | "session"): Storage | null {
  if (!isBrowser()) return null;
  try {
    const storage = type === "local" ? window.localStorage : window.sessionStorage;
    // Test that it actually works (can throw in private browsing)
    const testKey = "__pyreon_storage_test__";
    storage.setItem(testKey, "1");
    storage.removeItem(testKey);
    return storage;
  } catch {
    return null;
  }
}
