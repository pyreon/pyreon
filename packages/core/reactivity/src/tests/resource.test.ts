import { createResource } from "../resource";
import { signal } from "../signal";

describe("createResource", () => {
  test("fetches data when source changes", async () => {
    const userId = signal(1);
    const resource = createResource(
      () => userId(),
      (id) => Promise.resolve(`user-${id}`),
    );

    expect(resource.loading()).toBe(true);
    expect(resource.data()).toBeUndefined();
    expect(resource.error()).toBeUndefined();

    await new Promise((r) => setTimeout(r, 10));

    expect(resource.data()).toBe("user-1");
    expect(resource.loading()).toBe(false);
    expect(resource.error()).toBeUndefined();
  });

  test("re-fetches when source signal changes", async () => {
    const userId = signal(1);
    const resource = createResource(
      () => userId(),
      (id) => Promise.resolve(`user-${id}`),
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBe("user-1");

    userId.set(2);
    expect(resource.loading()).toBe(true);

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBe("user-2");
    expect(resource.loading()).toBe(false);
  });

  test("handles fetcher errors", async () => {
    const userId = signal(1);
    const resource = createResource(
      () => userId(),
      (_id) => Promise.reject(new Error("network error")),
    );

    await new Promise((r) => setTimeout(r, 10));

    expect(resource.error()).toBeInstanceOf(Error);
    expect((resource.error() as Error).message).toBe("network error");
    expect(resource.loading()).toBe(false);
    expect(resource.data()).toBeUndefined();
  });

  test("refetch re-runs the fetcher with current source", async () => {
    let fetchCount = 0;
    const userId = signal(1);
    const resource = createResource(
      () => userId(),
      (id) => {
        fetchCount++;
        return Promise.resolve(`user-${id}-${fetchCount}`);
      },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBe("user-1-1");

    resource.refetch();
    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBe("user-1-2");
  });

  test("ignores stale responses (race condition)", async () => {
    const userId = signal(1);
    const resolvers: ((v: string) => void)[] = [];

    const resource = createResource(
      () => userId(),
      (_id) =>
        new Promise<string>((resolve) => {
          resolvers.push((v) => resolve(v));
        }),
    );

    // First fetch is in flight
    expect(resolvers.length).toBe(1);

    // Change source — triggers second fetch
    userId.set(2);
    expect(resolvers.length).toBe(2);

    // Resolve the SECOND request first
    resolvers[1]?.("user-2");
    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBe("user-2");

    // Now resolve the FIRST (stale) request — should be ignored
    resolvers[0]?.("user-1");
    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBe("user-2"); // still user-2, not user-1
  });

  test("ignores stale errors (race condition)", async () => {
    const userId = signal(1);
    const rejecters: ((e: Error) => void)[] = [];
    const resolvers: ((v: string) => void)[] = [];

    const resource = createResource(
      () => userId(),
      (_id) =>
        new Promise<string>((resolve, reject) => {
          resolvers.push(resolve);
          rejecters.push(reject);
        }),
    );

    // First fetch in flight, change source
    userId.set(2);

    // Resolve second request
    resolvers[1]?.("user-2");
    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBe("user-2");

    // Reject first (stale) request — should be ignored
    rejecters[0]?.(new Error("stale error"));
    await new Promise((r) => setTimeout(r, 10));
    expect(resource.error()).toBeUndefined();
    expect(resource.data()).toBe("user-2");
  });

  test("loading returns to true on refetch", async () => {
    const userId = signal(1);
    const resource = createResource(
      () => userId(),
      (id) => Promise.resolve(`user-${id}`),
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.loading()).toBe(false);
    expect(resource.data()).toBe("user-1");

    resource.refetch();
    expect(resource.loading()).toBe(true);

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.loading()).toBe(false);
  });

  test("error is cleared on successful refetch", async () => {
    let shouldFail = true;
    const src = signal(1);
    const resource = createResource(
      () => src(),
      (_id) => (shouldFail ? Promise.reject(new Error("fail")) : Promise.resolve("ok")),
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.error()).toBeInstanceOf(Error);

    shouldFail = false;
    resource.refetch();
    await new Promise((r) => setTimeout(r, 10));
    expect(resource.error()).toBeUndefined();
    expect(resource.data()).toBe("ok");
  });

  test("error is cleared before each fetch attempt", async () => {
    let callCount = 0;
    const src = signal(1);
    const resource = createResource(
      () => src(),
      (_id) => {
        callCount++;
        if (callCount === 1) return Promise.reject(new Error("first fail"));
        return Promise.resolve("success");
      },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.error()).toBeInstanceOf(Error);

    // Trigger re-fetch by changing source
    src.set(2);
    // Error should be cleared immediately when new fetch starts
    expect(resource.error()).toBeUndefined();
    expect(resource.loading()).toBe(true);

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBe("success");
  });

  test("data is undefined initially and after error", async () => {
    const src = signal(1);
    const resource = createResource(
      () => src(),
      (_id) => Promise.reject(new Error("always fails")),
    );

    expect(resource.data()).toBeUndefined();

    await new Promise((r) => setTimeout(r, 10));
    expect(resource.data()).toBeUndefined();
    expect(resource.error()).toBeInstanceOf(Error);
  });

  test("refetch uses current source value", async () => {
    const src = signal(1);
    const results: string[] = [];
    const resource = createResource(
      () => src(),
      (id) => {
        const val = `user-${id}`;
        results.push(val);
        return Promise.resolve(val);
      },
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(results).toEqual(["user-1"]);

    src.set(5);
    await new Promise((r) => setTimeout(r, 10));
    expect(results).toEqual(["user-1", "user-5"]);

    // Refetch should use current source value (5)
    resource.refetch();
    await new Promise((r) => setTimeout(r, 10));
    expect(results).toEqual(["user-1", "user-5", "user-5"]);
  });
});
