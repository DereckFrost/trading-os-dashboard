import { parseR, roundMetric, validTrades, type MetricTrade } from "./performance";

function sortTrades(trades: MetricTrade[]) {
  return [...validTrades(trades)].sort((a, b) => {
    const left = `${a.trade_date ?? ""}|${a.created_at ?? ""}|${a.id ?? ""}`;
    const right = `${b.trade_date ?? ""}|${b.created_at ?? ""}|${b.id ?? ""}`;
    return left.localeCompare(right);
  });
}

export type EquityPoint = {
  date: string;
  equity: number;
  drawdown: number;
  trade: MetricTrade;
};

export function buildEquityCurve(trades: MetricTrade[]): EquityPoint[] {
  let equity = 0;
  let peak = 0;

  return sortTrades(trades).map((trade) => {
    equity += parseR(trade.r) ?? 0;
    peak = Math.max(peak, equity);

    return {
      date: trade.trade_date ?? "",
      equity: roundMetric(equity),
      drawdown: roundMetric(peak - equity),
      trade,
    };
  });
}

export function calculateMaxDrawdown(trades: MetricTrade[]): number {
  return roundMetric(
    buildEquityCurve(trades).reduce(
      (max, point) => Math.max(max, point.drawdown),
      0,
    ),
  );
}

export function calculateCurrentDrawdown(trades: MetricTrade[]): number {
  const curve = buildEquityCurve(trades);
  return curve.length ? curve[curve.length - 1].drawdown : 0;
}
