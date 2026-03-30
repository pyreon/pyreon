import { API_REFERENCE } from "../api-reference";

describe("api-reference", () => {
  it("has entries", () => {
    expect(Object.keys(API_REFERENCE).length).toBeGreaterThan(0);
  });

  it("entries have required fields", () => {
    for (const [key, entry] of Object.entries(API_REFERENCE)) {
      expect(entry.signature, `${key} missing signature`).toBeTruthy();
      expect(entry.example, `${key} missing example`).toBeTruthy();
    }
  });
});
