/**
 * Trading OS — Canonical Domain Models
 *
 * This file is the single source of truth for the shapes shared by
 * Journal, Trading Days, Metrics and Coach.
 *
 * Database/legacy field names are intentionally preserved here so the
 * migration does not force a UI-wide rename.
 */

export type TradingTrade = {
  id?: string | null;
  trade_date?: string | null;
  created_at?: string | null;

  instrument?: string | null;
  direction?: string | null;

  setup_id?: string | null;
  setup_quality?: string | null;

  execution_quality?: string | null;
  emotion?: string | null;
  close_type?: string | null;

  r?: number | string | null;

  trading_day_id?: string | null;
};

export type TradingDay = {
  id?: string | null;
  date?: string | null;

  mental_state?: string | null;

  waited_for_setup?: boolean | null;
  only_one_trade?: boolean | null;
  did_not_recover_losses?: boolean | null;
  session_finished?: boolean | null;

  notes?: string | null;
};

export type TradingSetup = {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  active?: boolean | null;
};

export type SopSession = {
  id?: string | null;
  date?: string | null;

  completedSteps?: unknown;
  completed_steps?: unknown;

  progress?: number | null;
  totalSteps?: number | null;
};
