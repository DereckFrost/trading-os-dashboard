export type AutomationType =
  | "weekly_review"
  | "monthly_review"
  | "behavior_alerts";

export type AutomationStatus =
  | "completed"
  | "skipped"
  | "failed";

export type AlertSeverity =
  | "info"
  | "warning"
  | "critical";

export type AutomationAlert = {
  id: string;
  severity: AlertSeverity;
  title: string;
  message: string;
  metric?: string;
  value?: number;
  threshold?: number;
};

export type AutomationReport = {
  title: string;
  verdict: string;
  executiveSummary: string;
  strengths: string[];
  risks: string[];
  priorities: string[];
  whatNotToChange: string[];
  longitudinal: string[];
  confidence: string;
};

export type AutomationPeriod = {
  type: "week" | "month";
  start: string;
  end: string;
};

export type AutomationTrigger =
  | "scheduled"
  | "behavior_detected"
  | "period_completed";

export type AutomationDefinition = {
  type: AutomationType;
  label: string;
  description: string;
  trigger: AutomationTrigger;
  triggerLabel: string;
  actionLabel: string;
  cadence: string;
  enabled: boolean;
};

export type AutomationRun = {
  id: string;
  automationType: AutomationType;
  periodType: string;
  periodStart: string;
  periodEnd: string;
  status: AutomationStatus;
  snapshot: Record<string, unknown> | null;
  report: AutomationReport | null;
  alerts: AutomationAlert[];
  aiModel: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AutomationResult = {
  success: boolean;
  automationType: AutomationType;
  period: AutomationPeriod | null;
  run: AutomationRun | null;
  alerts: AutomationAlert[];
  error?: string;
};
