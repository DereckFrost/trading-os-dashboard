export type Period =
  | "day"
  | "week"
  | "month"
  | "all";

export type PeriodOption = {
  value: Period;
  label: string;
};

export const PERIODS: PeriodOption[] = [
  {
    value: "day",
    label: "Este día",
  },
  {
    value: "week",
    label: "Esta semana",
  },
  {
    value: "month",
    label: "Este mes",
  },
  {
    value: "all",
    label: "Histórico",
  },
];

export const PERIOD_LABELS: Record<
  Period,
  string
> = {
  day: "Este día",
  week: "Esta semana",
  month: "Este mes",
  all: "Histórico",
};

export function isPeriod(
  value: unknown,
): value is Period {
  return (
    value === "day" ||
    value === "week" ||
    value === "month" ||
    value === "all"
  );
}

export function normalizePeriod(
  value: unknown,
  fallback: Period = "month",
): Period {
  if (isPeriod(value)) {
    return value;
  }

  return fallback;
}

export function getPeriodLabel(
  period: Period,
): string {
  return PERIOD_LABELS[period];
}

function parseDate(
  value: string,
): Date | null {
  if (!value) {
    return null;
  }

  const date = new Date(
    `${value.slice(0, 10)}T00:00:00`,
  );

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function startOfDay(
  date: Date,
): Date {
  const result = new Date(date);

  result.setHours(
    0,
    0,
    0,
    0,
  );

  return result;
}

function startOfWeek(
  date: Date,
): Date {
  const result = startOfDay(date);

  const day = result.getDay();

  // Monday = 0, Tuesday = 1, ... Sunday = 6
  const daysSinceMonday =
    day === 0
      ? 6
      : day - 1;

  result.setDate(
    result.getDate() -
      daysSinceMonday,
  );

  return result;
}

function startOfMonth(
  date: Date,
): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    1,
    0,
    0,
    0,
    0,
  );
}

export function getPeriodStart(
  period: Period,
  referenceDate = new Date(),
): Date | null {
  switch (period) {
    case "day":
      return startOfDay(
        referenceDate,
      );

    case "week":
      return startOfWeek(
        referenceDate,
      );

    case "month":
      return startOfMonth(
        referenceDate,
      );

    case "all":
      return null;

    default:
      return null;
  }
}

export function isDateInPeriod(
  dateValue: string,
  period: Period,
  referenceDate = new Date(),
): boolean {
  if (period === "all") {
    return true;
  }

  const date =
    parseDate(dateValue);

  if (!date) {
    return false;
  }

  const reference =
    startOfDay(referenceDate);

  if (period === "day") {
    return (
      date.getFullYear() ===
        reference.getFullYear() &&
      date.getMonth() ===
        reference.getMonth() &&
      date.getDate() ===
        reference.getDate()
    );
  }

  if (period === "week") {
    const weekStart =
      startOfWeek(reference);

    const weekEnd =
      new Date(weekStart);

    weekEnd.setDate(
      weekEnd.getDate() + 7,
    );

    return (
      date >= weekStart &&
      date < weekEnd
    );
  }

  if (period === "month") {
    const monthStart =
      startOfMonth(reference);

    const nextMonth =
      new Date(monthStart);

    nextMonth.setMonth(
      nextMonth.getMonth() + 1,
    );

    return (
      date >= monthStart &&
      date < nextMonth
    );
  }

  return false;
}

export function filterByPeriod<T>(
  items: T[],
  period: Period,
  getDate: (
    item: T,
  ) => string,
  referenceDate = new Date(),
): T[] {
  return items.filter(
    (item) =>
      isDateInPeriod(
        getDate(item),
        period,
        referenceDate,
      ),
  );
}