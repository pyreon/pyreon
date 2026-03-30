import { signal } from "@pyreon/reactivity";
import { describe, expect, it } from "vitest";
import {
  chunk,
  filter,
  find,
  flatten,
  groupBy,
  keyBy,
  last,
  map,
  mapValues,
  skip,
  sortBy,
  take,
  uniqBy,
} from "../collections";

type User = { id: number; name: string; role: string; active: boolean };
const users: User[] = [
  { id: 1, name: "Alice", role: "admin", active: true },
  { id: 2, name: "Bob", role: "viewer", active: false },
  { id: 3, name: "Charlie", role: "admin", active: true },
  { id: 4, name: "Diana", role: "editor", active: true },
];

describe("collections — plain values", () => {
  it("filter", () => {
    expect(filter(users, (u) => u.active)).toHaveLength(3);
  });

  it("map", () => {
    expect(map(users, (u) => u.name)).toEqual(["Alice", "Bob", "Charlie", "Diana"]);
  });

  it("sortBy string key", () => {
    const sorted = sortBy(users, "name");
    expect(sorted[0]!.name).toBe("Alice");
    expect(sorted[3]!.name).toBe("Diana");
  });

  it("sortBy function", () => {
    const sorted = sortBy(users, (u) => u.id);
    expect(sorted[0]!.id).toBe(1);
  });

  it("groupBy", () => {
    const groups = groupBy(users, "role");
    expect(groups.admin).toHaveLength(2);
    expect(groups.viewer).toHaveLength(1);
  });

  it("keyBy", () => {
    const indexed = keyBy(users, "id");
    expect(indexed["1"]!.name).toBe("Alice");
    expect(indexed["3"]!.name).toBe("Charlie");
  });

  it("uniqBy", () => {
    const result = uniqBy(users, "role");
    expect(result).toHaveLength(3); // admin, viewer, editor
  });

  it("take", () => {
    expect(take(users, 2)).toHaveLength(2);
    expect(take(users, 2)[0]!.name).toBe("Alice");
  });

  it("chunk", () => {
    const chunks = chunk(users, 2);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(2);
  });

  it("flatten", () => {
    const nested = [[1, 2], [3, 4], [5]];
    expect(flatten(nested)).toEqual([1, 2, 3, 4, 5]);
  });

  it("find", () => {
    expect(find(users, (u) => u.name === "Bob")?.id).toBe(2);
    expect(find(users, (u) => u.name === "Nobody")).toBeUndefined();
  });

  it("skip", () => {
    const result = skip(users, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Charlie");
    expect(result[1]!.name).toBe("Diana");
  });

  it("last", () => {
    const result = last(users, 2);
    expect(result).toHaveLength(2);
    expect(result[0]!.name).toBe("Charlie");
    expect(result[1]!.name).toBe("Diana");
  });

  it("mapValues", () => {
    const record: Record<string, number> = { a: 1, b: 2, c: 3 };
    const result = mapValues(record, (v) => v * 10);
    expect(result).toEqual({ a: 10, b: 20, c: 30 });
  });

  it("mapValues with key argument", () => {
    const record: Record<string, number> = { x: 1, y: 2 };
    const result = mapValues(record, (v, k) => `${k}=${v}`);
    expect(result).toEqual({ x: "x=1", y: "y=2" });
  });
});

describe("collections — signal values (reactive)", () => {
  it("filter returns computed that tracks signal", () => {
    const src = signal(users);
    const active = filter(src, (u) => u.active);
    expect(active()).toHaveLength(3);

    // Mutate source
    src.set([...users, { id: 5, name: "Eve", role: "admin", active: true }]);
    expect(active()).toHaveLength(4);
  });

  it("map returns computed", () => {
    const src = signal(users);
    const names = map(src, (u) => u.name);
    expect(names()).toEqual(["Alice", "Bob", "Charlie", "Diana"]);
  });

  it("sortBy returns computed", () => {
    const src = signal([{ n: "B" }, { n: "A" }, { n: "C" }]);
    const sorted = sortBy(src, "n");
    expect(sorted()[0]!.n).toBe("A");
  });

  it("groupBy returns computed", () => {
    const src = signal(users);
    const groups = groupBy(src, "role");
    expect(groups().admin).toHaveLength(2);
  });

  it("take returns computed", () => {
    const src = signal(users);
    const first2 = take(src, 2);
    expect(first2()).toHaveLength(2);

    src.set([users[0]!]);
    expect(first2()).toHaveLength(1);
  });

  it("does not mutate original array", () => {
    const original = [{ n: "B" }, { n: "A" }];
    const src = signal(original);
    sortBy(src, "n")();
    expect(original[0]!.n).toBe("B"); // original untouched
  });

  it("skip returns computed", () => {
    const src = signal(users);
    const skipped = skip(src, 3);
    expect(skipped()).toHaveLength(1);
    expect(skipped()[0]!.name).toBe("Diana");

    src.set([...users, { id: 5, name: "Eve", role: "admin", active: true }]);
    expect(skipped()).toHaveLength(2);
  });

  it("last returns computed", () => {
    const src = signal(users);
    const lastTwo = last(src, 2);
    expect(lastTwo()).toHaveLength(2);
    expect(lastTwo()[0]!.name).toBe("Charlie");

    src.set([users[0]!]);
    expect(lastTwo()).toHaveLength(1);
    expect(lastTwo()[0]!.name).toBe("Alice");
  });

  it("mapValues returns computed", () => {
    const src = signal<Record<string, number>>({ a: 1, b: 2 });
    const doubled = mapValues(src, (v) => v * 2);
    expect(doubled()).toEqual({ a: 2, b: 4 });

    src.set({ x: 10 });
    expect(doubled()).toEqual({ x: 20 });
  });

  it("mapValues with signal tracks key argument reactively", () => {
    const src = signal<Record<string, number[]>>({
      admin: [1, 2, 3],
      viewer: [4, 5],
    });
    const counts = mapValues(src, (arr, key) => ({ role: key, count: arr.length }));
    expect(counts()).toEqual({
      admin: { role: "admin", count: 3 },
      viewer: { role: "viewer", count: 2 },
    });

    src.set({ admin: [1], editor: [2, 3, 4, 5] });
    expect(counts()).toEqual({
      admin: { role: "admin", count: 1 },
      editor: { role: "editor", count: 4 },
    });
  });

  it("mapValues with signal handles empty record", () => {
    const src = signal<Record<string, number>>({});
    const doubled = mapValues(src, (v) => v * 2);
    expect(doubled()).toEqual({});

    src.set({ a: 5 });
    expect(doubled()).toEqual({ a: 10 });
  });
});
