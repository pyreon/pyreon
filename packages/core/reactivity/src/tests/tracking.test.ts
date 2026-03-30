import { batch } from "../batch";
import { effect, renderEffect } from "../effect";
import { signal } from "../signal";
import { runUntracked } from "../tracking";

describe("tracking", () => {
  describe("notifySubscribers", () => {
    test("multi-subscriber notification without batching (snapshot path)", () => {
      const s = signal(0);
      let runs1 = 0;
      let runs2 = 0;

      effect(() => {
        s();
        runs1++;
      });
      effect(() => {
        s();
        runs2++;
      });

      expect(runs1).toBe(1);
      expect(runs2).toBe(1);

      // Triggers non-batched multi-subscriber path (snapshot via [...subscribers])
      s.set(1);
      expect(runs1).toBe(2);
      expect(runs2).toBe(2);
    });

    test("multi-subscriber notification during batching", () => {
      const s = signal(0);
      let runs1 = 0;
      let runs2 = 0;

      effect(() => {
        s();
        runs1++;
      });
      effect(() => {
        s();
        runs2++;
      });

      batch(() => {
        s.set(1);
      });

      expect(runs1).toBe(2);
      expect(runs2).toBe(2);
    });

    test("single subscriber batching path", () => {
      const s = signal(0);
      let runs = 0;

      effect(() => {
        s();
        runs++;
      });

      batch(() => {
        s.set(1);
      });

      expect(runs).toBe(2);
    });
  });

  describe("runUntracked", () => {
    test("signal reads inside runUntracked do not create dependencies", () => {
      const s = signal(0);
      let runs = 0;

      effect(() => {
        runUntracked(() => s());
        runs++;
      });

      expect(runs).toBe(1);
      s.set(1);
      expect(runs).toBe(1); // not re-run
    });

    test("restores tracking context after runUntracked", () => {
      const tracked = signal(0);
      const untracked = signal(0);
      let runs = 0;

      effect(() => {
        tracked();
        runUntracked(() => untracked());
        runs++;
      });

      expect(runs).toBe(1);

      // tracked signal should still trigger re-run
      tracked.set(1);
      expect(runs).toBe(2);

      // untracked signal should not
      untracked.set(1);
      expect(runs).toBe(2);
    });
  });

  describe("trackSubscriber with depsCollector", () => {
    test("renderEffect uses fast deps collector path", () => {
      const s = signal(0);
      let runs = 0;

      const dispose = renderEffect(() => {
        s();
        runs++;
      });

      s.set(1);
      expect(runs).toBe(2);

      dispose();
      s.set(2);
      expect(runs).toBe(2);
    });
  });

  describe("cleanupEffect", () => {
    test("effect dynamically tracks/untracks deps on re-run", () => {
      const cond = signal(true);
      const a = signal(0);
      const b = signal(0);
      let runs = 0;

      effect(() => {
        if (cond()) {
          a();
        } else {
          b();
        }
        runs++;
      });

      expect(runs).toBe(1);

      a.set(1); // tracked
      expect(runs).toBe(2);

      cond.set(false); // switch branch
      expect(runs).toBe(3);

      a.set(2); // no longer tracked
      expect(runs).toBe(3);

      b.set(1); // now tracked
      expect(runs).toBe(4);
    });
  });
});
