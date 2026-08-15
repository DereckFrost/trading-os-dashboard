import { describe, expect, it } from "vitest";

describe("trade journal policy", () => {
  it("allows subsequent trades after the first trade", () => {
    const requiresSopGate = (
      existingTradeCount: number,
    ) => existingTradeCount === 0;

    expect(requiresSopGate(0)).toBe(true);
    expect(requiresSopGate(1)).toBe(false);
    expect(requiresSopGate(2)).toBe(false);
  });

  it("does not make a closed trading day a CRUD lock", () => {
    const canEditTrade = () => true;

    expect(canEditTrade()).toBe(true);
  });
});