// Persist the form's last-used values in localStorage so opening the
// modal a second time doesn't make the user re-type their sens/DPI.

import type { NewRecordingInput } from "./types";

const KEY = "recoil-pattern-recorder.defaults.v1";

export interface StoredDefaults {
  game: string;
  weapon: string;
  reference_sensitivity: number;
  reference_dpi: number;
  fire_rate_ms: number;
  max_shots: number;
}

export function loadDefaults(): StoredDefaults | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Minimal validation — a schema change nukes old storage.
    if (
      typeof parsed.game === "string" &&
      typeof parsed.weapon === "string" &&
      typeof parsed.reference_sensitivity === "number" &&
      typeof parsed.reference_dpi === "number" &&
      typeof parsed.fire_rate_ms === "number" &&
      typeof parsed.max_shots === "number"
    ) {
      return parsed as StoredDefaults;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveDefaults(input: NewRecordingInput) {
  try {
    const toSave: StoredDefaults = {
      game: input.game,
      weapon: input.weapon,
      reference_sensitivity: input.reference_sensitivity,
      reference_dpi: input.reference_dpi,
      fire_rate_ms: input.fire_rate_ms,
      max_shots: input.max_shots,
    };
    localStorage.setItem(KEY, JSON.stringify(toSave));
  } catch {
    /* localStorage full / blocked — ignore */
  }
}

const ONBOARDED_KEY = "recoil-pattern-recorder.onboarded.v1";

export function hasOnboarded(): boolean {
  try {
    return localStorage.getItem(ONBOARDED_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboarded() {
  try {
    localStorage.setItem(ONBOARDED_KEY, "1");
  } catch {
    /* noop */
  }
}
