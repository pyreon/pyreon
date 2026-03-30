import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SSR tests for styled() and createGlobalStyle(). Re-imports modules
 * with `document` deleted so IS_SERVER evaluates to true.
 */
describe("styled -- SSR mode", () => {
  let originalDocument: typeof document;

  beforeEach(() => {
    vi.resetModules();
    originalDocument = globalThis.document;
    // @ts-expect-error - intentionally deleting for SSR simulation
    delete globalThis.document;
  });

  afterEach(() => {
    globalThis.document = originalDocument;
  });

  it("static: creates component with SSR injection path", async () => {
    const { styled } = await import("../styled");
    const Comp = styled("div")`
      color: red;
    `;
    expect((Comp as any).displayName).toBe("styled(div)");
  });

  it("static: empty CSS template in SSR", async () => {
    const { styled } = await import("../styled");
    const Comp = styled("div")``;
    expect((Comp as any).displayName).toBe("styled(div)");
  });

  it("static: boost option in SSR", async () => {
    const { styled } = await import("../styled");
    const Comp = styled("div", { boost: true })`
      color: blue;
    `;
    expect((Comp as any).displayName).toBe("styled(div)");
  });

  it("static: shouldForwardProp in SSR", async () => {
    const { styled } = await import("../styled");
    const Comp = styled("div", {
      shouldForwardProp: (p) => p !== "color",
    })`
      display: flex;
    `;
    expect((Comp as any).displayName).toBe("styled(div)");
  });

  it("static: styled.div shorthand in SSR", async () => {
    const { styled } = await import("../styled");
    const Comp = styled.div`
      color: green;
    `;
    expect((Comp as any).displayName).toBe("styled(div)");
  });

  it("createGlobalStyle: static SSR path", async () => {
    const { createGlobalStyle } = await import("../globalStyle");
    const GlobalStyle = createGlobalStyle`body { margin: 0; }`;
    // Static path injects immediately and returns a function that produces null
    const result = GlobalStyle({});
    expect(result).toBeNull();
  });

  it("createGlobalStyle: empty CSS in SSR returns null", async () => {
    const { createGlobalStyle } = await import("../globalStyle");
    const GlobalStyle = createGlobalStyle``;
    const result = GlobalStyle({});
    expect(result).toBeNull();
  });
});
