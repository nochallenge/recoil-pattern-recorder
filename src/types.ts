// TS mirrors of the Rust types in src-tauri/src/pattern.rs.
// Keep these in sync with the Rust structs — serde_json serialization
// is field-for-field.

export interface PatternEvent {
  t_ms: number;
  dx: number;
  dy: number;
}

export interface HumanizeConfig {
  jitter_magnitude_pct: number;
  jitter_timing_ms: number;
  drift_compensation_pct: number;
  first_shot_delay_ms_min: number;
  first_shot_delay_ms_max: number;
  disengage_shots_min: number;
  disengage_shots_max: number;
  random_skip_chance_pct: number;
  tremor_amplitude: number;
}

export interface Pattern {
  schema_version: number;
  name: string;
  game: string;
  weapon: string;
  created_at: string;
  reference_sensitivity: number;
  reference_dpi: number;
  fire_rate_ms: number;
  max_shots: number;
  events: PatternEvent[];
  humanize: HumanizeConfig;
}

export interface PatternSummary {
  filename: string;
  name: string;
  game: string;
  weapon: string;
  created_at: string;
  event_count: number;
}

export type RecordingState = "idle" | "armed" | "recording" | "done";

export interface RecordingStatus {
  state: RecordingState;
  event_count: number;
  name: string | null;
  duration_ms: number;
}

export type NewRecordingInput = {
  name: string;
  game: string;
  weapon: string;
  reference_sensitivity: number;
  reference_dpi: number;
  fire_rate_ms: number;
  max_shots: number;
}
