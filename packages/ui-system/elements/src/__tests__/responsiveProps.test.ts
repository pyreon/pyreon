import type { VNode } from "@pyreon/core";
import { h } from "@pyreon/core";
import { describe, expect, it } from "vitest";
import { Element } from "../Element";
import Content from "../helpers/Content/component";
import Wrapper from "../helpers/Wrapper/component";

const asVNode = (v: unknown) => v as VNode;

const getContentSlots = (result: VNode): VNode[] => {
  const children = result.props.children;
  if (!Array.isArray(children)) return [];
  return children.filter(
    (c: unknown) =>
      c != null && typeof c === "object" && "type" in (c as VNode) && (c as VNode).type === Content,
  ) as VNode[];
};

describe("Element responsive props", () => {
  describe("single values", () => {
    it("renders with alignX as string", () => {
      const result = asVNode(Element({ alignX: "center", children: "content" }));
      expect(result.type).toBe(Wrapper);
    });

    it("renders with alignY as string", () => {
      const result = asVNode(Element({ alignY: "top", children: "content" }));
      expect(result.type).toBe(Wrapper);
    });

    it("renders with direction as string", () => {
      const result = asVNode(Element({ direction: "rows", children: "content" }));
      expect(result.type).toBe(Wrapper);
    });

    it("renders with gap as number", () => {
      const result = asVNode(
        Element({
          gap: 16,
          beforeContent: h("span", null, "Before"),
          afterContent: h("span", null, "After"),
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with block as boolean", () => {
      const result = asVNode(Element({ block: true, children: "content" }));
      expect(result.type).toBe(Wrapper);
      expect(result.props.block).toBe(true);
    });

    it("renders with equalCols as boolean", () => {
      const result = asVNode(
        Element({
          equalCols: true,
          beforeContent: h("span", null, "Before"),
          afterContent: h("span", null, "After"),
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
    });
  });

  describe("array values (positional breakpoints)", () => {
    it("renders with alignX as array", () => {
      const result = asVNode(
        Element({ alignX: ["left", "center", "right"] as any, children: "content" }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with alignY as array", () => {
      const result = asVNode(
        Element({ alignY: ["top", "center", "bottom"] as any, children: "content" }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with direction as array", () => {
      const result = asVNode(
        Element({ direction: ["rows", "inline"] as any, children: "content" }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with gap as array", () => {
      const result = asVNode(
        Element({
          gap: [8, 16, 24] as any,
          beforeContent: h("span", null, "Before"),
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with block as array", () => {
      const result = asVNode(Element({ block: [false, true] as any, children: "content" }));
      expect(result.type).toBe(Wrapper);
    });

    it("renders with equalCols as array", () => {
      const result = asVNode(
        Element({
          equalCols: [false, true] as any,
          beforeContent: h("span", null, "Before"),
          afterContent: h("span", null, "After"),
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
    });
  });

  describe("breakpoint object values", () => {
    it("renders with alignX as breakpoint object", () => {
      const result = asVNode(
        Element({
          alignX: { xs: "left", md: "center", xl: "right" } as any,
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with alignY as breakpoint object", () => {
      const result = asVNode(
        Element({ alignY: { xs: "top", lg: "center" } as any, children: "content" }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with direction as breakpoint object", () => {
      const result = asVNode(
        Element({
          direction: { xs: "rows", md: "inline" } as any,
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with gap as breakpoint object", () => {
      const result = asVNode(
        Element({
          gap: { xs: 8, md: 16, lg: 24 } as any,
          beforeContent: h("span", null, "Before"),
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
    });

    it("renders with block as breakpoint object", () => {
      const result = asVNode(
        Element({ block: { xs: false, md: true } as any, children: "content" }),
      );
      expect(result.type).toBe(Wrapper);
    });
  });

  describe("combined responsive props", () => {
    it("renders with multiple responsive props simultaneously", () => {
      const result = asVNode(
        Element({
          alignX: { xs: "left", md: "center" } as any,
          alignY: ["top", "center"] as any,
          direction: { xs: "rows", lg: "inline" } as any,
          block: [false, true] as any,
          gap: 16,
          beforeContent: h("span", { "data-testid": "before" }, "Before"),
          afterContent: h("span", { "data-testid": "after" }, "After"),
          children: h("span", { "data-testid": "main" }, "Main"),
        }),
      );
      expect(result.type).toBe(Wrapper);
      const slots = getContentSlots(result);
      expect(slots).toHaveLength(3);
    });

    it("renders with responsive content directions", () => {
      const result = asVNode(
        Element({
          contentDirection: { xs: "rows", md: "inline" } as any,
          beforeContentDirection: { xs: "inline", lg: "rows" } as any,
          afterContentDirection: "inline",
          beforeContent: h("span", null, "Before"),
          afterContent: h("span", null, "After"),
          children: h("span", null, "Main"),
        }),
      );
      expect(result.type).toBe(Wrapper);
      const slots = getContentSlots(result);
      expect(slots).toHaveLength(3);
    });

    it("renders with responsive content alignment", () => {
      const result = asVNode(
        Element({
          contentAlignX: { xs: "left", md: "center" } as any,
          contentAlignY: ["top", "center", "bottom"] as any,
          beforeContentAlignX: "left",
          afterContentAlignX: "right",
          beforeContent: h("span", null, "Before"),
          afterContent: h("span", null, "After"),
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
    });
  });

  describe("responsive css prop", () => {
    it("renders with css as string", () => {
      const result = asVNode(Element({ css: "background: red;", children: "content" }));
      expect(result.type).toBe(Wrapper);
      expect(result.props.extendCss).toBe("background: red;");
    });

    it("renders with contentCss", () => {
      const result = asVNode(
        Element({
          contentCss: "color: blue;",
          beforeContent: h("span", null, "Before"),
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
      const slots = getContentSlots(result);
      const contentSlot = slots.find((v) => v.props.contentType === "content");
      expect(contentSlot?.props.extendCss).toBe("color: blue;");
    });

    it("renders with beforeContentCss and afterContentCss", () => {
      const result = asVNode(
        Element({
          beforeContentCss: "padding: 4px;",
          afterContentCss: "padding: 8px;",
          beforeContent: h("span", null, "Before"),
          afterContent: h("span", null, "After"),
          children: "content",
        }),
      );
      expect(result.type).toBe(Wrapper);
      const slots = getContentSlots(result);
      const beforeSlot = slots.find((v) => v.props.contentType === "before");
      const afterSlot = slots.find((v) => v.props.contentType === "after");
      expect(beforeSlot?.props.extendCss).toBe("padding: 4px;");
      expect(afterSlot?.props.extendCss).toBe("padding: 8px;");
    });
  });

  describe("alignment values", () => {
    const alignXValues = [
      "left",
      "center",
      "right",
      "spaceBetween",
      "spaceAround",
      "block",
    ] as const;

    const alignYValues = [
      "top",
      "center",
      "bottom",
      "spaceBetween",
      "spaceAround",
      "block",
    ] as const;

    for (const value of alignXValues) {
      it(`renders with alignX="${value}"`, () => {
        const result = asVNode(Element({ alignX: value, children: "content" }));
        expect(result.type).toBe(Wrapper);
      });
    }

    for (const value of alignYValues) {
      it(`renders with alignY="${value}"`, () => {
        const result = asVNode(Element({ alignY: value, children: "content" }));
        expect(result.type).toBe(Wrapper);
      });
    }
  });

  describe("direction values", () => {
    const directionValues = ["inline", "rows", "reverseInline", "reverseRows"] as const;

    for (const value of directionValues) {
      it(`renders with direction="${value}"`, () => {
        const result = asVNode(Element({ direction: value, children: "content" }));
        expect(result.type).toBe(Wrapper);
      });
    }
  });
});
