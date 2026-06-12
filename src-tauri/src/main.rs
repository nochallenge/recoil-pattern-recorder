// src-tauri/src/main.rs
//
// Tauri entry. Recording pipeline:
//
//   1. On app startup we spawn a single rdev listener thread that
//      lives for the process lifetime (rdev has no clean shutdown).
//   2. That thread feeds events to the shared Recorder (if any) and
//      emits "recorder-state-change" whenever the recording state
//      transitions (Armed -> Recording -> Done).
//   3. The frontend arms/stops the recorder via commands and polls
//      `recording_status` while active to update the event counter.
//
// Patterns are serialized as JSON in the OS-standard app-data
// directory (e.g. %APPDATA%/com.recoil-trainer.app/patterns on
// Windows). The directory is logged to stdout on first launch so
// developers can find their recordings.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pattern;
mod input_capture;
mod recorder;
mod humanizer;
mod device;

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use parking_lot::{Mutex, RwLock};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

use pattern::Pattern;
use recorder::{Recorder, RecordingState};
use input_capture::{start_capture, CaptureHandle};

struct AppState {
    recorder: Arc<Mutex<Option<Recorder>>>,
    patterns_dir: PathBuf,
    /// User-configurable hotkey (rdev Debug name, e.g. "F8", "F9").
    hotkey: Arc<RwLock<String>>,
    /// Total input events observed since launch. Drives the capture
    /// test screen — if this doesn't tick, rdev is being blocked.
    capture_events: Arc<AtomicU64>,
    _capture: CaptureHandle,
}

#[derive(Serialize, Clone)]
struct RecordingStatus {
    state: RecordingState,
    event_count: usize,
    name: Option<String>,
    duration_ms: u32,
}

#[derive(Serialize, Clone)]
struct PatternSummary {
    filename: String,
    name: String,
    game: String,
    weapon: String,
    created_at: String,
    event_count: usize,
}

// -------------------------------------------------------------------
// Commands
// -------------------------------------------------------------------

#[allow(clippy::too_many_arguments)]
#[tauri::command(rename_all = "snake_case")]
fn start_recording(
    state: State<AppState>,
    name: String,
    game: String,
    weapon: String,
    reference_sensitivity: f32,
    reference_dpi: u16,
    fire_rate_ms: u16,
    max_shots: u16,
) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("pattern name required".into());
    }
    let mut p = Pattern::new(name, game, weapon);
    p.reference_sensitivity = reference_sensitivity;
    p.reference_dpi = reference_dpi;
    p.fire_rate_ms = fire_rate_ms;
    p.max_shots = max_shots;

    let mut rec = Recorder::new(p);
    rec.arm();
    *state.recorder.lock() = Some(rec);
    Ok(())
}

#[tauri::command]
fn stop_recording(state: State<AppState>) -> Result<Pattern, String> {
    let mut guard = state.recorder.lock();
    let rec = guard.as_mut().ok_or("no active recording")?;
    rec.stop();
    Ok(rec.pattern().clone())
}

#[tauri::command]
fn cancel_recording(app: AppHandle, state: State<AppState>) -> Result<(), String> {
    *state.recorder.lock() = None;
    // Emit Idle so anything listening (e.g. a future non-modal cancel
    // path) can react; current modal flow still drives via onClose.
    let _ = app.emit("recorder-state-change", RecordingState::Idle);
    Ok(())
}

#[tauri::command]
fn recording_status(state: State<AppState>) -> RecordingStatus {
    let guard = state.recorder.lock();
    match guard.as_ref() {
        Some(rec) => {
            let events = &rec.pattern().events;
            let duration = events.last().map(|e| e.t_ms).unwrap_or(0);
            RecordingStatus {
                state: rec.state(),
                event_count: events.len(),
                name: Some(rec.pattern().name.clone()),
                duration_ms: duration,
            }
        }
        None => RecordingStatus {
            state: RecordingState::Idle,
            event_count: 0,
            name: None,
            duration_ms: 0,
        },
    }
}

#[tauri::command]
fn current_pattern(state: State<AppState>) -> Result<Pattern, String> {
    let guard = state.recorder.lock();
    guard
        .as_ref()
        .map(|r| r.pattern().clone())
        .ok_or_else(|| "no active recording".into())
}

#[tauri::command]
fn list_patterns(state: State<AppState>) -> Result<Vec<PatternSummary>, String> {
    let dir = &state.patterns_dir;
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut out = Vec::new();
    let entries = std::fs::read_dir(dir).map_err(|e| e.to_string())?;
    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) != Some("json") {
            continue;
        }
        let filename = match path.file_name().and_then(|s| s.to_str()) {
            Some(s) => s.to_string(),
            None => continue,
        };
        let bytes = match std::fs::read(&path) {
            Ok(b) => b,
            Err(_) => continue,
        };
        if let Ok(p) = serde_json::from_slice::<Pattern>(&bytes) {
            out.push(PatternSummary {
                filename,
                name: p.name,
                game: p.game,
                weapon: p.weapon,
                created_at: p.created_at,
                event_count: p.events.len(),
            });
        }
    }
    out.sort_by(|a, b| b.created_at.cmp(&a.created_at));
    Ok(out)
}

#[tauri::command]
fn load_pattern(state: State<AppState>, filename: String) -> Result<Pattern, String> {
    let path = state.patterns_dir.join(sanitize_filename(&filename));
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn save_pattern(state: State<AppState>, pattern: Pattern) -> Result<String, String> {
    let dir = &state.patterns_dir;
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;

    // Take the first 19 chars of the ISO-8601 timestamp ("YYYY-MM-DDTHH:MM:SS")
    // and replace colons so the filename works on every filesystem.
    let stamp: String = pattern
        .created_at
        .chars()
        .take(19)
        .map(|c| if c == ':' { '-' } else { c })
        .collect();
    let filename = format!("{}__{}.json", pattern.slug(), stamp);
    let path = dir.join(&filename);

    let bytes = serde_json::to_vec_pretty(&pattern).map_err(|e| e.to_string())?;
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    Ok(filename)
}

#[tauri::command]
fn delete_pattern(state: State<AppState>, filename: String) -> Result<(), String> {
    let path = state.patterns_dir.join(sanitize_filename(&filename));
    if !path.exists() {
        return Err("file not found".into());
    }
    std::fs::remove_file(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn patterns_dir(state: State<AppState>) -> String {
    state.patterns_dir.to_string_lossy().to_string()
}

#[tauri::command]
fn capture_stats(state: State<AppState>) -> u64 {
    state.capture_events.load(Ordering::Relaxed)
}

#[tauri::command]
fn get_hotkey(state: State<AppState>) -> String {
    state.hotkey.read().clone()
}

#[tauri::command]
fn set_hotkey(state: State<AppState>, key: String) -> Result<(), String> {
    let trimmed = key.trim();
    if trimmed.is_empty() {
        return Err("hotkey cannot be empty".into());
    }
    *state.hotkey.write() = trimmed.to_string();
    Ok(())
}

fn sanitize_filename(name: &str) -> String {
    name.chars()
        .filter(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-'))
        .collect()
}

// -------------------------------------------------------------------
// main
// -------------------------------------------------------------------

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let patterns_dir = app
                .path()
                .app_data_dir()
                .map(|d| d.join("patterns"))
                .unwrap_or_else(|e| {
                    eprintln!(
                        "recoil-trainer: app_data_dir unavailable ({e}); \
                         falling back to ./patterns"
                    );
                    std::path::PathBuf::from("patterns")
                });
            if let Err(e) = std::fs::create_dir_all(&patterns_dir) {
                eprintln!(
                    "recoil-trainer: could not create patterns dir {}: {e}",
                    patterns_dir.display()
                );
            }
            println!("recoil-trainer: patterns dir = {}", patterns_dir.display());

            let recorder: Arc<Mutex<Option<Recorder>>> = Arc::new(Mutex::new(None));
            let hotkey: Arc<RwLock<String>> = Arc::new(RwLock::new("F8".to_string()));
            let capture_events: Arc<AtomicU64> = Arc::new(AtomicU64::new(0));

            let recorder_for_capture = recorder.clone();
            let hotkey_for_capture = hotkey.clone();
            let counter_for_capture = capture_events.clone();
            let app_handle = app.handle().clone();

            let capture = start_capture(move |ev| {
                counter_for_capture.fetch_add(1, Ordering::Relaxed);

                // Configurable hotkey: match by rdev-Debug name.
                if let input_capture::InputEvent::KeyPress { key, .. } = &ev {
                    if *key == *hotkey_for_capture.read() {
                        let _ = app_handle.emit("hotkey-pressed", ());
                    }
                    return;
                }

                let state_change = {
                    let mut guard = recorder_for_capture.lock();
                    if let Some(rec) = guard.as_mut() {
                        let before = rec.state();
                        rec.feed(&ev);
                        let after = rec.state();
                        if before != after { Some(after) } else { None }
                    } else {
                        None
                    }
                };
                if let Some(s) = state_change {
                    let _ = app_handle.emit("recorder-state-change", s);
                }
            });

            app.manage(AppState {
                recorder,
                patterns_dir,
                hotkey,
                capture_events,
                _capture: capture,
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_recording,
            stop_recording,
            cancel_recording,
            recording_status,
            current_pattern,
            list_patterns,
            load_pattern,
            save_pattern,
            delete_pattern,
            patterns_dir,
            capture_stats,
            get_hotkey,
            set_hotkey,
        ])
        .run(tauri::generate_context!())
        .expect("tauri failed to launch");
}
