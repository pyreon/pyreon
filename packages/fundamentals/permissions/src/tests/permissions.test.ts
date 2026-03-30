import { computed, effect, signal } from "@pyreon/reactivity";
import { describe, expect, it } from "vitest";
import { createPermissions } from "../index";

describe("createPermissions", () => {
  // ─── Basic checks ────────────────────────────────────────────────────────

  describe("static permissions", () => {
    it("returns true for granted permissions", () => {
      const can = createPermissions({ "posts.read": true });
      expect(can("posts.read")).toBe(true);
    });

    it("returns false for denied permissions", () => {
      const can = createPermissions({ "posts.delete": false });
      expect(can("posts.delete")).toBe(false);
    });

    it("returns false for undefined permissions", () => {
      const can = createPermissions({ "posts.read": true });
      expect(can("users.manage")).toBe(false);
    });

    it("handles empty initial permissions", () => {
      const can = createPermissions();
      expect(can("anything")).toBe(false);
    });

    it("handles empty object", () => {
      const can = createPermissions({});
      expect(can("anything")).toBe(false);
    });
  });

  // ─── Predicate permissions ─────────────────────────────────────────────

  describe("predicate permissions", () => {
    it("evaluates predicate without context", () => {
      const role = signal("admin");
      const can = createPermissions({
        "users.manage": () => role() === "admin",
      });
      expect(can("users.manage")).toBe(true);
    });

    it("evaluates predicate with context", () => {
      const userId = signal("user-1");
      const can = createPermissions({
        "posts.update": (post: any) => post?.authorId === userId.peek(),
      });

      expect(can("posts.update", { authorId: "user-1" })).toBe(true);
      expect(can("posts.update", { authorId: "user-2" })).toBe(false);
    });

    it("predicate without context returns result of calling with undefined", () => {
      const can = createPermissions({
        "posts.update": (post?: any) => post?.authorId === "user-1",
      });
      // No context — post is undefined, so authorId check fails
      expect(can("posts.update")).toBe(false);
    });

    it("predicate that ignores context", () => {
      const can = createPermissions({
        "posts.create": () => true,
      });
      expect(can("posts.create")).toBe(true);
    });
  });

  // ─── Wildcard matching ─────────────────────────────────────────────────

  describe("wildcard matching", () => {
    it("matches prefix wildcard", () => {
      const can = createPermissions({ "posts.*": true });
      expect(can("posts.read")).toBe(true);
      expect(can("posts.create")).toBe(true);
      expect(can("posts.delete")).toBe(true);
    });

    it("exact match takes precedence over wildcard", () => {
      const can = createPermissions({
        "posts.*": true,
        "posts.delete": false,
      });
      expect(can("posts.read")).toBe(true);
      expect(can("posts.delete")).toBe(false);
    });

    it("global wildcard matches everything", () => {
      const can = createPermissions({ "*": true });
      expect(can("posts.read")).toBe(true);
      expect(can("users.manage")).toBe(true);
      expect(can("anything")).toBe(true);
    });

    it("exact match takes precedence over global wildcard", () => {
      const can = createPermissions({
        "*": true,
        "billing.export": false,
      });
      expect(can("posts.read")).toBe(true);
      expect(can("billing.export")).toBe(false);
    });

    it("prefix wildcard takes precedence over global wildcard", () => {
      const can = createPermissions({
        "*": false,
        "posts.*": true,
      });
      expect(can("posts.read")).toBe(true);
      expect(can("users.manage")).toBe(false);
    });

    it("wildcard with predicate", () => {
      const can = createPermissions({
        "posts.*": (post: any) => post?.status !== "archived",
      });
      expect(can("posts.read", { status: "published" })).toBe(true);
      expect(can("posts.update", { status: "archived" })).toBe(false);
    });

    it("does not match partial prefixes", () => {
      const can = createPermissions({ "post.*": true });
      expect(can("posts.read")).toBe(false); // 'posts' !== 'post'
    });
  });

  // ─── can.not ───────────────────────────────────────────────────────────

  describe("can.not()", () => {
    it("returns inverse of can()", () => {
      const can = createPermissions({
        "posts.read": true,
        "posts.delete": false,
      });
      expect(can.not("posts.read")).toBe(false);
      expect(can.not("posts.delete")).toBe(true);
      expect(can.not("users.manage")).toBe(true);
    });

    it("works with predicates and context", () => {
      const can = createPermissions({
        "posts.update": (post: any) => post?.authorId === "me",
      });
      expect(can.not("posts.update", { authorId: "me" })).toBe(false);
      expect(can.not("posts.update", { authorId: "other" })).toBe(true);
    });
  });

  // ─── can.all / can.any ─────────────────────────────────────────────────

  describe("can.all()", () => {
    it("returns true when all permissions are granted", () => {
      const can = createPermissions({
        "posts.read": true,
        "posts.create": true,
      });
      expect(can.all("posts.read", "posts.create")).toBe(true);
    });

    it("returns false when any permission is denied", () => {
      const can = createPermissions({
        "posts.read": true,
        "posts.delete": false,
      });
      expect(can.all("posts.read", "posts.delete")).toBe(false);
    });

    it("returns true for empty args", () => {
      const can = createPermissions();
      expect(can.all()).toBe(true);
    });
  });

  describe("can.any()", () => {
    it("returns true when any permission is granted", () => {
      const can = createPermissions({
        "posts.read": false,
        "posts.create": true,
      });
      expect(can.any("posts.read", "posts.create")).toBe(true);
    });

    it("returns false when no permissions are granted", () => {
      const can = createPermissions({
        "posts.read": false,
        "posts.delete": false,
      });
      expect(can.any("posts.read", "posts.delete")).toBe(false);
    });

    it("returns false for empty args", () => {
      const can = createPermissions();
      expect(can.any()).toBe(false);
    });
  });

  // ─── set / patch ───────────────────────────────────────────────────────

  describe("set()", () => {
    it("replaces all permissions", () => {
      const can = createPermissions({
        "posts.read": true,
        "users.manage": true,
      });
      expect(can("posts.read")).toBe(true);
      expect(can("users.manage")).toBe(true);

      can.set({ "posts.read": false });
      expect(can("posts.read")).toBe(false);
      expect(can("users.manage")).toBe(false); // replaced, not merged
    });

    it("triggers reactive updates", () => {
      const can = createPermissions({ "posts.read": true });
      const results: boolean[] = [];

      effect(() => {
        results.push(can("posts.read"));
      });

      expect(results).toEqual([true]);

      can.set({ "posts.read": false });
      expect(results).toEqual([true, false]);
    });
  });

  describe("patch()", () => {
    it("merges with existing permissions", () => {
      const can = createPermissions({
        "posts.read": true,
        "users.manage": false,
      });

      can.patch({ "users.manage": true, "billing.view": true });
      expect(can("posts.read")).toBe(true); // unchanged
      expect(can("users.manage")).toBe(true); // updated
      expect(can("billing.view")).toBe(true); // added
    });

    it("triggers reactive updates", () => {
      const can = createPermissions({ "posts.read": false });
      const results: boolean[] = [];

      effect(() => {
        results.push(can("posts.read"));
      });

      expect(results).toEqual([false]);

      can.patch({ "posts.read": true });
      expect(results).toEqual([false, true]);
    });
  });

  // ─── Reactivity ────────────────────────────────────────────────────────

  describe("reactivity", () => {
    it("can() is reactive inside effect", () => {
      const can = createPermissions({ "posts.read": true });
      const results: boolean[] = [];

      effect(() => {
        results.push(can("posts.read"));
      });

      can.set({ "posts.read": false });
      can.set({ "posts.read": true });

      expect(results).toEqual([true, false, true]);
    });

    it("can() is reactive inside computed", () => {
      const can = createPermissions({ admin: true });
      const isAdmin = computed(() => can("admin"));

      expect(isAdmin()).toBe(true);

      can.set({ admin: false });
      expect(isAdmin()).toBe(false);
    });

    it("can.not() is reactive", () => {
      const can = createPermissions({ "posts.read": true });
      const results: boolean[] = [];

      effect(() => {
        results.push(can.not("posts.read"));
      });

      can.set({ "posts.read": false });
      expect(results).toEqual([false, true]);
    });

    it("can.all() is reactive", () => {
      const can = createPermissions({
        "posts.read": true,
        "posts.create": true,
      });
      const results: boolean[] = [];

      effect(() => {
        results.push(can.all("posts.read", "posts.create"));
      });

      can.patch({ "posts.create": false });
      expect(results).toEqual([true, false]);
    });

    it("can.any() is reactive", () => {
      const can = createPermissions({
        "posts.read": false,
        "posts.create": true,
      });
      const results: boolean[] = [];

      effect(() => {
        results.push(can.any("posts.read", "posts.create"));
      });

      can.patch({ "posts.create": false });
      expect(results).toEqual([true, false]);
    });

    it("predicate with reactive signals inside", () => {
      const role = signal("admin");
      const can = createPermissions({
        "users.manage": () => role() === "admin",
      });

      // The predicate reads `role()` but reactivity is driven by
      // the permission version signal, not the inner signal.
      // To react to role changes, update permissions:
      expect(can("users.manage")).toBe(true);

      can.patch({ "users.manage": () => role() === "admin" });
      role.set("viewer");
      // Need to re-evaluate — the predicate itself reads the signal
      // but the permission system doesn't track inner signal deps.
      // This is by design: update permissions via set/patch when the source changes.
    });
  });

  // ─── granted / entries ─────────────────────────────────────────────────

  describe("granted()", () => {
    it("returns keys with true values", () => {
      const can = createPermissions({
        "posts.read": true,
        "posts.delete": false,
        "users.manage": true,
      });
      expect(can.granted()).toEqual(expect.arrayContaining(["posts.read", "users.manage"]));
      expect(can.granted()).not.toContain("posts.delete");
    });

    it("includes predicate keys", () => {
      const can = createPermissions({
        "posts.update": (post: any) => post?.authorId === "me",
      });
      // Predicates are capabilities — they exist
      expect(can.granted()).toContain("posts.update");
    });

    it("is reactive", () => {
      const can = createPermissions({ "posts.read": true });
      const results: string[][] = [];

      effect(() => {
        results.push([...can.granted()]);
      });

      can.patch({ "users.manage": true });
      expect(results).toEqual([["posts.read"], ["posts.read", "users.manage"]]);
    });
  });

  describe("entries()", () => {
    it("returns all entries", () => {
      const can = createPermissions({
        "posts.read": true,
        "posts.delete": false,
      });
      const entries = can.entries();
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          ["posts.read", true],
          ["posts.delete", false],
        ]),
      );
    });

    it("is reactive", () => {
      const can = createPermissions({ a: true });
      const counts: number[] = [];

      effect(() => {
        counts.push(can.entries().length);
      });

      can.patch({ b: true });
      expect(counts).toEqual([1, 2]);
    });
  });

  // ─── Error handling & edge cases ──────────────────────────────────────

  describe("predicate that throws", () => {
    it("returns false when predicate throws", () => {
      const can = createPermissions({
        "posts.update": () => {
          throw new Error("predicate boom");
        },
      });
      // Should not crash — returns false
      expect(can("posts.update")).toBe(false);
    });

    it("returns false with context when predicate throws", () => {
      const can = createPermissions({
        "posts.update": (_post: any) => {
          throw new Error("predicate boom");
        },
      });
      expect(can("posts.update", { id: 1 })).toBe(false);
    });

    it("can.not returns true when predicate throws", () => {
      const can = createPermissions({
        "posts.update": () => {
          throw new Error("boom");
        },
      });
      expect(can.not("posts.update")).toBe(true);
    });
  });

  describe("can.all/can.any with empty args", () => {
    it("can.all() with no args returns true (vacuous truth)", () => {
      const can = createPermissions({ "posts.read": false });
      expect(can.all()).toBe(true);
    });

    it("can.any() with no args returns false", () => {
      const can = createPermissions({ "posts.read": true });
      expect(can.any()).toBe(false);
    });
  });

  describe("rapid set/patch cycles", () => {
    it("final state is correct after rapid set calls", () => {
      const can = createPermissions({ a: true });

      for (let i = 0; i < 50; i++) {
        can.set({ a: i % 2 === 0 });
      }

      // 50 iterations, last i=49, 49 % 2 = 1, so false
      expect(can("a")).toBe(false);
    });

    it("final state is correct after rapid patch calls", () => {
      const can = createPermissions({ a: true, b: false });

      for (let i = 0; i < 50; i++) {
        can.patch({ a: i % 2 === 0, b: i % 3 === 0 });
      }

      // last i=49: 49%2=1 → false, 49%3=1 → false
      expect(can("a")).toBe(false);
      expect(can("b")).toBe(false);
    });

    it("reactive effects see correct final state after rapid changes", () => {
      const can = createPermissions({ a: true });
      const results: boolean[] = [];

      effect(() => {
        results.push(can("a"));
      });

      can.set({ a: false });
      can.set({ a: true });
      can.set({ a: false });

      // Effect should have tracked all transitions
      expect(results[0]).toBe(true);
      expect(results[results.length - 1]).toBe(false);
    });

    it("interleaved set and patch produce correct state", () => {
      const can = createPermissions({});

      can.set({ a: true, b: true });
      can.patch({ c: true });
      can.set({ a: false }); // replaces everything
      can.patch({ d: true });

      expect(can("a")).toBe(false);
      expect(can("b")).toBe(false); // cleared by set
      expect(can("c")).toBe(false); // cleared by set
      expect(can("d")).toBe(true); // added by last patch
    });
  });

  describe("cleanup / disposal", () => {
    it("granted computed still works after many set/patch cycles", () => {
      const can = createPermissions({ a: true });

      for (let i = 0; i < 20; i++) {
        can.set({ a: true, [`key-${i}`]: true });
      }

      const granted = can.granted();
      expect(granted).toContain("a");
      expect(granted).toContain("key-19");
      expect(granted).not.toContain("key-0"); // cleared by last set
    });

    it("entries computed reflects current state after many mutations", () => {
      const can = createPermissions({});

      can.set({ a: true });
      can.patch({ b: false });
      can.set({ c: true });

      const entries = can.entries();
      expect(entries).toEqual([["c", true]]);
    });

    it("effects tracking permissions react correctly to updates", () => {
      const can = createPermissions({ a: true });
      let count = 0;

      effect(() => {
        can("a");
        count++;
      });

      const initial = count;
      can.set({ a: false });
      expect(count).toBe(initial + 1);
    });
  });

  // ─── Real-world patterns ───────────────────────────────────────────────

  describe("real-world patterns", () => {
    it("role-based access control", () => {
      function fromRole(role: string) {
        const roles: Record<string, Record<string, boolean>> = {
          admin: { "posts.*": true, "users.*": true, "billing.*": true },
          editor: {
            "posts.read": true,
            "posts.create": true,
            "posts.update": true,
            "users.read": true,
          },
          viewer: { "posts.read": true },
        };
        return roles[role] ?? {};
      }

      const can = createPermissions(fromRole("editor"));

      expect(can("posts.read")).toBe(true);
      expect(can("posts.create")).toBe(true);
      expect(can("posts.delete")).toBe(false);
      expect(can("users.read")).toBe(true);
      expect(can("users.manage")).toBe(false);
      expect(can("billing.view")).toBe(false);

      // Promote to admin
      can.set(fromRole("admin"));
      expect(can("posts.delete")).toBe(true);
      expect(can("users.manage")).toBe(true);
      expect(can("billing.view")).toBe(true);
    });

    it("feature flags mixed with permissions", () => {
      const can = createPermissions({
        "posts.read": true,
        "posts.create": true,
        "feature.new-editor": true,
        "feature.dark-mode": false,
        "tier.pro": true,
        "tier.enterprise": false,
      });

      expect(can("feature.new-editor")).toBe(true);
      expect(can("feature.dark-mode")).toBe(false);
      expect(can("tier.pro")).toBe(true);
      expect(can("tier.enterprise")).toBe(false);
    });

    it("instance-level ownership checks", () => {
      const currentUserId = "user-42";

      const can = createPermissions({
        "posts.read": true,
        "posts.update": (post: any) => post?.authorId === currentUserId,
        "posts.delete": (post: any) => post?.authorId === currentUserId && post?.status === "draft",
      });

      const myPost = { authorId: "user-42", status: "draft" };
      const otherPost = { authorId: "user-99", status: "draft" };
      const publishedPost = { authorId: "user-42", status: "published" };

      expect(can("posts.update", myPost)).toBe(true);
      expect(can("posts.update", otherPost)).toBe(false);
      expect(can("posts.delete", myPost)).toBe(true);
      expect(can("posts.delete", publishedPost)).toBe(false);
    });

    it("multi-tenant with key prefixes", () => {
      const can = createPermissions({
        "org:acme.admin": true,
        "ws:design.posts.*": true,
        "ws:engineering.posts.read": true,
      });

      expect(can("org:acme.admin")).toBe(true);
      expect(can("ws:design.posts.read")).toBe(true);
      expect(can("ws:design.posts.delete")).toBe(true);
      expect(can("ws:engineering.posts.read")).toBe(true);
      expect(can("ws:engineering.posts.delete")).toBe(false);
    });

    it("server response transformation", () => {
      // Simulated server response
      const serverResponse = {
        permissions: ["posts:read", "posts:create", "users:read"],
      };

      // Simple transform — not a framework feature, just a .map()
      const perms = Object.fromEntries(
        serverResponse.permissions.map((p) => [p.replace(":", "."), true]),
      );

      const can = createPermissions(perms);
      expect(can("posts.read")).toBe(true);
      expect(can("posts.create")).toBe(true);
      expect(can("users.read")).toBe(true);
      expect(can("posts.delete")).toBe(false);
    });

    it("superadmin with global wildcard", () => {
      const can = createPermissions({ "*": true });
      expect(can("literally.anything")).toBe(true);
      expect(can("posts.read")).toBe(true);
      expect(can("admin.nuclear-launch")).toBe(true);
    });

    it("reactive role switching", () => {
      function fromRole(role: string): Record<string, boolean> {
        if (role === "admin") return { "*": true };
        if (role === "editor") return { "posts.*": true, "users.read": true };
        return { "posts.read": true };
      }

      const can = createPermissions(fromRole("viewer"));
      const results: boolean[] = [];

      effect(() => {
        results.push(can("posts.create"));
      });

      expect(results).toEqual([false]);

      can.set(fromRole("editor"));
      expect(results).toEqual([false, true]);

      can.set(fromRole("admin"));
      expect(results).toEqual([false, true, true]);

      can.set(fromRole("viewer"));
      expect(results).toEqual([false, true, true, false]);
    });
  });
});
