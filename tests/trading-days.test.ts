import { describe, expect, it } from "vitest";

describe("trading day trade-count semantics", () => {
  const onlyOneTrade = (
    tradeCount: number,
  ) => tradeCount === 1;

  it("is false with zero trades", () => {
    expect(onlyOneTrade(0)).toBe(false);
  });

  it("is true with exactly one trade", () => {
    expect(onlyOneTrade(1)).toBe(true);
  });

  it("is false with multiple trades", () => {
    expect(onlyOneTrade(2)).toBe(false);
    expect(onlyOneTrade(3)).toBe(false);
  });
});
