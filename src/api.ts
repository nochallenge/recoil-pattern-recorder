// Thin wrappers around Tauri `invoke()` so the rest of the app can
// call `api.listPatterns()` instead of magic-string command names.
// When a command is renamed, this file is the only thing that changes.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  NewRecordingInput,
  Pattern,
  PatternSummary,
  RecordingState,
  RecordingStatus,
} from "./types";

export const api = {
  startRecording: (input: NewRecordingInput): Promise<void> =>
    invoke("start_recording", input),

  stopRecording: (): Promise<Pattern> => invoke("stop_recording"),

  cancelRecording: (): Promise<void> => invoke("cancel_recording"),

  recordingStatus: (): Promise<RecordingStatus> => invoke("recording_status"),

  currentPattern: (): Promise<Pattern> => invoke("current_pattern"),

  listPatterns: (): Promise<PatternSummary[]> => invoke("list_patterns"),

  loadPattern: (filename: string): Promise<Pattern> =>
    invoke("load_pattern", { filename }),

  savePattern: (pattern: Pattern): Promise<string> =>
    invoke("save_pattern", { pattern }),

  deletePattern: (filename: string): Promise<void> =>
    invoke("delete_pattern", { filename }),

  patternsDir: (): Promise<string> => invoke("patterns_dir"),

  captureStats: (): Promise<number> => invoke("capture_stats"),

  getHotkey: (): Promise<string> => invoke("get_hotkey"),

  setHotkey: (key: string): Promise<void> => invoke("set_hotkey", { key }),

  onStateChange: (handler: (state: RecordingState) => void): Promise<UnlistenFn> =>
    listen<RecordingState>("recorder-state-change", (event) => handler(event.payload)),

  onHotkey: (handler: () => void): Promise<UnlistenFn> =>
    listen<void>("hotkey-pressed", () => handler()),
};
