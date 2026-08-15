import {
  describe,
  expect,
  it,
} from "vitest";

import {
  SOP_STEPS,
  calculateProgress,
  countCompletedSteps,
  getActiveWaitValidation,
  getEntryValidation,
  isAfterEntryValidationStart,
  isAfterSopStart,
  normalizeCompletedSteps,
} from "../app/lib/sop";

describe("SOP", () => {
  it("has 7 ordered steps", () => {
    expect(SOP_STEPS).toHaveLength(7);

    expect(SOP_STEPS.map((step) => step.id)).toEqual([
      1,
      2,
      4,
      5,
      6,
      7,
      8,
    ]);
  });

  it("calculates completion correctly", () => {
    const steps = {
      "1": true,
      "2": true,
      "4": true,
      "5": false,
      "6": false,
      "7": false,
      "8": false,
    };

    expect(countCompletedSteps(steps)).toBe(3);
    expect(calculateProgress(steps)).toBe(43);

    expect(normalizeCompletedSteps(steps)).toEqual({
      1: true,
      2: true,
      4: true,
    });
  });

  it("allows active waiting from 09:20", () => {
    const before = new Date(2026, 7, 13, 9, 19);
    const atStart = new Date(2026, 7, 13, 9, 20);

    expect(isAfterSopStart(before)).toBe(false);
    expect(isAfterSopStart(atStart)).toBe(true);
  });

  it("keeps entry validation locked until 09:45", () => {
    const before = new Date(2026, 7, 13, 9, 44);
    const atStart = new Date(2026, 7, 13, 9, 45);

    expect(
      isAfterEntryValidationStart(before),
    ).toBe(false);

    expect(
      isAfterEntryValidationStart(atStart),
    ).toBe(true);
  });

  it("reads active wait and entry validation from the SOP session", () => {
    const session = {
      "__activeWaitValidation": {
        confirmations: {
          htfDirection: true,
          liquidityLevels: true,
          validZones: true,
          validSmt: true,
          dailyCycle: true,
        },
        validatedAt: "2026-08-13T13:45:00.000Z",
      },

      "__entryValidation": {
        setupId: "setup-1",
        setupName: "Sweep + LED + IFC",
        setupQuality: "A+",
        confirmations: {
          planSetup: true,
          structure: true,
          confirmation: true,
          risk: true,
          mentalState: true,
        },
        validatedAt: "2026-08-13T14:00:00.000Z",
      },
    };

    const activeWait =
      getActiveWaitValidation(session);

    const entry =
      getEntryValidation(session);

    expect(activeWait).not.toBeNull();
    expect(
      activeWait?.confirmations.liquidityLevels,
    ).toBe(true);

    expect(
      activeWait?.confirmations.validZones,
    ).toBe(true);

    expect(entry).not.toBeNull();
    expect(entry?.setupId).toBe("setup-1");
    expect(entry?.setupQuality).toBe("A+");
  });
});