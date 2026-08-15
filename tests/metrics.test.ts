import { describe, expect, it } from "vitest";
import { calculatePerformanceMetrics } from "../app/lib/metrics/performance";

const trade = (r: number, setup_quality = "A+") =>
  ({ r, setup_quality }) as never;

describe("performance metrics", () => {
  it("handles wins, losses and breakeven", () => {
    const metrics = calculatePerformanceMetrics([
      trade(2),
      trade(-1),
      trade(0),
    ]);

    expect(metrics.totalTrades).toBe(3);
    expect(metrics.netR).toBe(1);
    expect(metrics.wins).toBe(1);
    expect(metrics.losses).toBe(1);
    expect(metrics.breakeven).toBe(1);
    expect(metrics.winRate).toBe(33);
    expect(metrics.profitFactor).toBe(2);
  });

  it("ignores invalid R values", () => {
    const metrics = calculatePerformanceMetrics([
      trade(1),
      trade(Number.NaN),
    ]);

    expect(metrics.totalTrades).toBe(1);
    expect(metrics.netR).toBe(1);
  });
});
