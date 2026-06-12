// src-tauri/src/input_capture.rs
//
// Global mouse input capture via rdev. Pushes events through a
// user-supplied callback so the caller can both feed a Recorder
// and emit Tauri events in one place — no more Sync/Send mismatch
// from holding an mpsc Receiver inside Arc.
//
// NOTE on anti-cheat: rdev uses standard OS hooks. Vanguard-level
// kernel anti-cheats may block capture in fullscreen. Record in
// windowed/borderless first.

use rdev::{listen, Event, EventType};
use std::thread;
use std::time::Instant;

/// Events emitted by the global input capture.
#[derive(Debug, Clone)]
pub enum InputEvent {
    MouseMove { dx: f64, dy: f64, t_us: u64 },
    ButtonPress { button: String, t_us: u64 },
    ButtonRelease { button: String, t_us: u64 },
    /// Name comes from rdev's Debug impl (e.g. "F8", "F9", "F12").
    /// Caller decides whether to treat it as a hotkey.
    KeyPress { key: String, t_us: u64 },
}

/// Handle returned by [`start_capture`]. Keeping it alive keeps the
/// listener thread running. rdev has no clean-shutdown API, so the
/// thread lives for the process lifetime — we just drop the handle
/// when the app exits.
pub struct CaptureHandle {
    _thread: thread::JoinHandle<()>,
}

/// Spawn the rdev listener thread. The callback runs on the listener
/// thread for every input event.
pub fn start_capture<F>(mut on_event: F) -> CaptureHandle
where
    F: FnMut(InputEvent) + Send + 'static,
{
    let start = Instant::now();

    let handle = thread::spawn(move || {
        let mut last_pos: Option<(f64, f64)> = None;

        let callback = move |event: Event| {
            let t_us = start.elapsed().as_micros() as u64;
            let out = match event.event_type {
                EventType::MouseMove { x, y } => {
                    let delta = if let Some((lx, ly)) = last_pos {
                        (x - lx, y - ly)
                    } else {
                        (0.0, 0.0)
                    };
                    last_pos = Some((x, y));
                    // Drop the initial (0,0) so we don't emit a bogus first sample.
                    if delta == (0.0, 0.0) {
                        None
                    } else {
                        Some(InputEvent::MouseMove {
                            dx: delta.0,
                            dy: delta.1,
                            t_us,
                        })
                    }
                }
                EventType::ButtonPress(b) => Some(InputEvent::ButtonPress {
                    button: format!("{:?}", b),
                    t_us,
                }),
                EventType::ButtonRelease(b) => Some(InputEvent::ButtonRelease {
                    button: format!("{:?}", b),
                    t_us,
                }),
                EventType::KeyPress(k) => Some(InputEvent::KeyPress {
                    key: format!("{:?}", k),
                    t_us,
                }),
                _ => None,
            };
            if let Some(e) = out {
                on_event(e);
            }
        };

        if let Err(e) = listen(callback) {
            eprintln!("rdev listen error: {:?}", e);
        }
    });

    CaptureHandle { _thread: handle }
}
