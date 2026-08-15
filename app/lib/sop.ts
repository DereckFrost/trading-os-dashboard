export type SopPhase =
  | "Preparación"
  | "Ejecución"
  | "Cierre";

export type SopStep = {
  id: number;
  label: string;
  detail?: string;
  phase: SopPhase;
  availableAfter?: string;
};

export type ActiveWaitValidation = {
  confirmations: {
    htfDirection: boolean;
    liquidityLevels: boolean;
    validZones: boolean;
    validSmt: boolean;
    dailyCycle: boolean;
  };
  validatedAt: string;
};

export type EntryValidation = {
  setupId: string;
  setupName: string;
  setupQuality: string;
  riskAmount?: number;
  rr?: number;
  confirmations: {
    planSetup: boolean;
    structure: boolean;
    confirmation: boolean;
    risk: boolean;
    mentalState: boolean;
  };
  validatedAt: string;
};

export type SopCompletedSteps = Record<string, unknown>;

export const ACTIVE_WAIT_START_MINUTES = 9 * 60 + 20;
export const ENTRY_VALIDATION_START_MINUTES = 9 * 60 + 45;

// Backwards-compatible alias: the SOP execution window begins with active wait.
export const SOP_START_MINUTES = ACTIVE_WAIT_START_MINUTES;

export const SOP_STEPS: SopStep[] = [
  {
    id: 1,
    label: "Lectura trading al día",
    phase: "Preparación",
  },
  {
    id: 2,
    label: "Lectura de principios",
    phase: "Preparación",
  },
  {
    id: 4,
    label: "Esperar activamente",
    detail: "A partir de las 9:20 AM",
    phase: "Ejecución",
    availableAfter: "09:20",
  },
  {
    id: 5,
    label: "Ejecutar únicamente un setup válido",
    phase: "Ejecución",
  },
  {
    id: 6,
    label: "Documentarlo",
    phase: "Ejecución",
  },
  {
    id: 7,
    label: "Cerrar plataformas",
    phase: "Cierre",
  },
  {
    id: 8,
    label: "Finalizar jornada",
    phase: "Cierre",
  },
];

export const ACTIVE_WAIT_CONFIRMATIONS = [
  [
    "htfDirection",
    "Dirección en HTF",
  ],
  [
    "liquidityLevels",
    "Niveles de liquidez (PDH / PDL / PHW / PLW / BSL / SSL)",
  ],
  [
    "validZones",
    "Zonas válidas (1H / 15M / 5M)",
  ],
  [
    "validSmt",
    "SMT válido",
  ],
  [
    "dailyCycle",
    "Posible ciclo diario (Asia / Londres)",
  ],
] as const;

export const ENTRY_CONFIRMATIONS = [
  [
    "planSetup",
    "El setup pertenece al plan y está correctamente identificado.",
  ],
  [
    "structure",
    "La estructura y las confluencias requeridas están completas.",
  ],
  [
    "confirmation",
    "La confirmación de entrada ya ocurrió; no estoy anticipando.",
  ],
  [
    "risk",
    "El riesgo está definido y aceptado para esta entrada.",
  ],
  [
    "mentalState",
    "Estoy en condiciones de ejecutar sin impulso, FOMO ni recuperación.",
  ],
] as const;

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function getCurrentMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

export function isAfterSopStart(date = new Date()) {
  return getCurrentMinutes(date) >= ACTIVE_WAIT_START_MINUTES;
}

export function isAfterEntryValidationStart(date = new Date()) {
  return getCurrentMinutes(date) >= ENTRY_VALIDATION_START_MINUTES;
}

export function normalizeCompletedSteps(value: unknown): Record<number, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const result: Record<number, boolean> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const stepId = Number(key);

    if (
      Number.isInteger(stepId) &&
      SOP_STEPS.some((step) => step.id === stepId) &&
      item === true
    ) {
      result[stepId] = true;
    }
  }

  return result;
}

function getValidationObject(
  value: unknown,
  key: "__entryValidation" | "__activeWaitValidation",
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const raw = (value as Record<string, unknown>)[key];

  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }

  return raw as Record<string, unknown>;
}

export function getEntryValidation(value: unknown): EntryValidation | null {
  const raw = getValidationObject(value, "__entryValidation");

  if (!raw) {
    return null;
  }

  return raw as unknown as EntryValidation;
}

export function getActiveWaitValidation(
  value: unknown,
): ActiveWaitValidation | null {
  const raw = getValidationObject(value, "__activeWaitValidation");

  if (!raw) {
    return null;
  }

  return raw as unknown as ActiveWaitValidation;
}

export function countCompletedSteps(value: unknown) {
  const completed = normalizeCompletedSteps(value);

  return SOP_STEPS.filter((step) => completed[step.id] === true).length;
}

export function calculateProgress(value: unknown) {
  return Math.round((countCompletedSteps(value) / SOP_STEPS.length) * 100);
}

export function normalizeQuality(value: string | null | undefined) {
  return (value ?? "")
    .replace(/^[^A-Za-z0-9]+/u, "")
    .trim()
    .toLowerCase();
}

export function canonicalSetupQuality(value: string | null | undefined) {
  const normalized = normalizeQuality(value);

  if (normalized === "a+") return "A+";
  if (normalized === "b+") return "B+";
  if (normalized === "b") return "B";
  if (normalized === "c") return "C";

  return value?.trim() ?? "";
}

export function isValidSetupQuality(value: string | null | undefined) {
  return ["A+", "B+", "B", "C"].includes(canonicalSetupQuality(value));
}

export function canonicalExecutionQuality(
  value: string | null | undefined,
) {
  const normalized = normalizeQuality(value);

  if (normalized === "excelente") return "Excelente";
  if (normalized === "buena") return "Buena";
  if (normalized === "regular") return "Regular";
  if (normalized === "mala") return "Mala";

  return value?.trim() ?? "";
}

export function isInvalidSetupName(name: string | null | undefined) {
  const normalized = (name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

  return normalized.includes("no valido") || normalized.includes("fomo");
}

export function isInvalidSetupQuality(quality: string | null | undefined) {
  return canonicalSetupQuality(quality) === "C";
}

export function calculateExecutionScore(
  executionQuality: string | null | undefined,
  setupQuality: string | null | undefined,
) {
  const execution =
    {
      Excelente: 100,
      Buena: 75,
      Regular: 50,
      Mala: 0,
    }[canonicalExecutionQuality(executionQuality)] ?? 0;

  const setup =
    {
      "A+": 100,
      "B+": 85,
      B: 70,
      C: 40,
    }[canonicalSetupQuality(setupQuality)] ?? 0;

  return Math.round(execution * 0.7 + setup * 0.3);
}