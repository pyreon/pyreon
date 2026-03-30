import { onMount } from "@pyreon/core";
import { describe, expect, it } from "vitest";
import useIsomorphicLayoutEffect from "../useIsomorphicLayoutEffect";

describe("useIsomorphicLayoutEffect", () => {
  it("is onMount in a browser environment", () => {
    expect(useIsomorphicLayoutEffect).toBe(onMount);
  });
});
