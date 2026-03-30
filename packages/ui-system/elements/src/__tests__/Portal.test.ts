import type { VNode } from "@pyreon/core";
import { Portal as CorePortal, h } from "@pyreon/core";
import { describe, expect, it } from "vitest";
import { Portal } from "../Portal";

const asVNode = (v: unknown) => v as VNode;

describe("Portal", () => {
  describe("rendering", () => {
    it("returns a VNode whose type is CorePortal", () => {
      const child = h("div", null, "modal content");
      const result = asVNode(Portal({ children: child }));
      expect(result.type).toBe(CorePortal);
    });

    it("defaults target to document.body when DOMLocation is not provided", () => {
      const child = h("div", null, "content");
      const result = asVNode(Portal({ children: child }));
      const props = result.props as Record<string, unknown>;
      expect(props.target).toBe(document.body);
    });

    it("uses DOMLocation as target when provided", () => {
      const customTarget = document.createElement("div");
      const child = h("span", null, "inside");
      const result = asVNode(Portal({ DOMLocation: customTarget, children: child }));
      const props = result.props as Record<string, unknown>;
      expect(props.target).toBe(customTarget);
    });

    it("passes children through to the CorePortal VNode", () => {
      const child = h("div", { class: "modal" }, "Modal content");
      const result = asVNode(Portal({ children: child }));
      const props = result.props as Record<string, unknown>;
      expect(props.children).toBe(child);
    });

    it("passes string children", () => {
      const result = asVNode(Portal({ children: "text content" }));
      const props = result.props as Record<string, unknown>;
      expect(props.children).toBe("text content");
    });

    it("passes number children", () => {
      const result = asVNode(Portal({ children: 42 }));
      const props = result.props as Record<string, unknown>;
      expect(props.children).toBe(42);
    });

    it("passes nested VNode children", () => {
      const nested = h("div", null, h("span", null, "level 1"), h("span", null, "level 2"));
      const result = asVNode(Portal({ children: nested }));
      const props = result.props as Record<string, unknown>;
      const childVNode = asVNode(props.children);
      expect(childVNode.type).toBe("div");
      expect(childVNode.children).toHaveLength(2);
    });
  });

  describe("tag prop", () => {
    it("accepts tag prop without affecting output type", () => {
      const child = h("div", null, "content");
      const result = asVNode(Portal({ tag: "section", children: child }));
      // tag is accepted but not used — output is still a Portal VNode
      expect(result.type).toBe(CorePortal);
    });
  });

  describe("statics", () => {
    it("has correct displayName", () => {
      expect(Portal.displayName).toBe("@pyreon/elements/Portal");
    });

    it("has correct pkgName", () => {
      expect(Portal.pkgName).toBe("@pyreon/elements");
    });

    it("has correct PYREON__COMPONENT", () => {
      expect(Portal.PYREON__COMPONENT).toBe("@pyreon/elements/Portal");
    });
  });
});
