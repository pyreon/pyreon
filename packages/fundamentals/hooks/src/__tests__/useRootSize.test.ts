import { describe, expect, it, vi } from "vitest";

// Mock @pyreon/styler to provide theme values
vi.mock("@pyreon/styler", () => ({
  useTheme: () => ({}),
}));

import { useRootSize } from "../useRootSize";

describe("useRootSize", () => {
  it("defaults rootSize to 16", () => {
    const result = useRootSize();
    expect(result.rootSize).toBe(16);
  });

  it("pxToRem converts correctly with default rootSize", () => {
    const result = useRootSize();
    expect(result.pxToRem(32)).toBe("2rem");
    expect(result.pxToRem(8)).toBe("0.5rem");
  });

  it("remToPx converts correctly with default rootSize", () => {
    const result = useRootSize();
    expect(result.remToPx(2)).toBe(32);
    expect(result.remToPx(0.5)).toBe(8);
  });
});
