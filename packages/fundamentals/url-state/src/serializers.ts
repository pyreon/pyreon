import type { ArrayFormat, Serializer } from "./types"

/** Infer a serializer pair from the type of the default value. */
export function inferSerializer<T>(
  defaultValue: T,
  arrayFormat: ArrayFormat = "comma",
): Serializer<T> {
  if (Array.isArray(defaultValue)) {
    if (arrayFormat === "repeat") {
      return {
        serialize: (v: T) => (v as string[]).join("\0REPEAT\0"),
        deserialize: (raw: string) => (raw === "" ? [] : raw.split("\0REPEAT\0")) as T,
      }
    }
    // comma (default)
    return {
      serialize: (v: T) => (v as string[]).join(","),
      deserialize: (raw: string) => (raw === "" ? [] : raw.split(",")) as T,
    }
  }

  switch (typeof defaultValue) {
    case "number":
      return {
        serialize: (v: T) => String(v),
        deserialize: (raw: string) => Number(raw) as T,
      }
    case "boolean":
      return {
        serialize: (v: T) => String(v),
        deserialize: (raw: string) => (raw === "true") as T,
      }
    case "string":
      return {
        serialize: (v: T) => v as string,
        deserialize: (raw: string) => raw as T,
      }
    case "object":
      return {
        serialize: (v: T) => JSON.stringify(v),
        deserialize: (raw: string) => JSON.parse(raw) as T,
      }
    default:
      return {
        serialize: (v: T) => String(v),
        deserialize: (raw: string) => raw as T,
      }
  }
}
