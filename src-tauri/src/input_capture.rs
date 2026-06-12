// src-tauri/src/input_capture.rs
//
// Global input capture.
//
// Mouse movement:
//   * Windows: raw input (`WM_INPUT` via RegisterRawInputDevices with
//     RIDEV_INPUTSINK). Raw input reports the device's relative motion
//     counts BEFORE the OS applies pointer ballistics or cursor
//     clamping/recentering, so games that lock and recenter the cursor
//     every frame do not distort the recorded deltas.
//   * Other platforms: rdev's MouseMove reports cursor *position*; we
//     difference successive positions. Pointer-locking / recentering
//     games can distort this — record on the desktop or in a mode
//     without pointer lock there.
//
// Mouse buttons + keyboard: rdev on every platform. (Buttons and
// movement share a single monotonic clock so per-event timing stays
// consistent regardless of which backend produced the event.)
//
// rdev uses standard OS hooks; kernel anti-cheats can suppress them in
// fullscreen. The in-app capture diagnostic shows whether events arrive.

use rdev::{listen, Event, EventType};
use std::sync::Arc;
use std::thread;
use std::time::Instant;

use parking_lot::Mutex;

/// Events emitted by the global input capture.
#[derive(Debug, Clone)]
pub enum InputEvent {
    MouseMove { dx: f64, dy: f64, t_us: u64 },
    ButtonPress { button: String, t_us: u64 },
    ButtonRelease { button: String },
    /// Name comes from rdev's Debug impl (e.g. "F8", "F9", "F12").
    /// Caller decides whether to treat it as a hotkey.
    KeyPress { key: String },
}

/// Callback shared across capture threads (rdev + raw input on Windows).
type SharedSink = Arc<Mutex<Box<dyn FnMut(InputEvent) + Send>>>;

/// Handle returned by [`start_capture`]. Keeping it alive keeps the
/// listener thread(s) running. rdev (and the raw-input message loop)
/// have no clean-shutdown API, so the threads live for the process
/// lifetime — we just drop the handle when the app exits.
pub struct CaptureHandle {
    _threads: Vec<thread::JoinHandle<()>>,
}

/// Start global capture. The callback runs on a listener thread for
/// every input event.
pub fn start_capture<F>(on_event: F) -> CaptureHandle
where
    F: FnMut(InputEvent) + Send + 'static,
{
    let start = Instant::now();
    let sink: SharedSink = Arc::new(Mutex::new(Box::new(on_event)));

    let mut threads = vec![spawn_rdev(sink.clone(), start)];

    #[cfg(windows)]
    threads.push(raw_mouse::spawn(sink.clone(), start));

    CaptureHandle { _threads: threads }
}

/// rdev listener: keyboard + mouse buttons everywhere, and mouse
/// movement on non-Windows platforms.
fn spawn_rdev(sink: SharedSink, start: Instant) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        #[cfg(not(windows))]
        let mut last_pos: Option<(f64, f64)> = None;

        let callback = move |event: Event| {
            let t_us = start.elapsed().as_micros() as u64;
            let out: Option<InputEvent> = match event.event_type {
                EventType::ButtonPress(b) => Some(InputEvent::ButtonPress {
                    button: format!("{:?}", b),
                    t_us,
                }),
                EventType::ButtonRelease(b) => Some(InputEvent::ButtonRelease {
                    button: format!("{:?}", b),
                }),
                EventType::KeyPress(k) => Some(InputEvent::KeyPress {
                    key: format!("{:?}", k),
                }),

                // On Windows the mouse delta comes from raw input; ignore
                // rdev's position-based MouseMove to avoid double-counting.
                #[cfg(not(windows))]
                EventType::MouseMove { x, y } => {
                    let delta = match last_pos {
                        Some((lx, ly)) => (x - lx, y - ly),
                        None => (0.0, 0.0),
                    };
                    last_pos = Some((x, y));
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
                _ => None,
            };
            if let Some(e) = out {
                (sink.lock())(e);
            }
        };

        if let Err(e) = listen(callback) {
            eprintln!("rdev listen error: {:?}", e);
        }
    })
}

/// Windows raw-input mouse-movement backend. A hidden message-only
/// window registers for raw mouse input (RIDEV_INPUTSINK so it receives
/// input even in the background) and forwards relative deltas.
#[cfg(windows)]
mod raw_mouse {
    use super::{InputEvent, SharedSink};
    use std::cell::RefCell;
    use std::ffi::c_void;
    use std::thread;
    use std::time::Instant;

    use windows::core::w;
    use windows::Win32::Foundation::{HWND, LPARAM, LRESULT, WPARAM};
    use windows::Win32::System::LibraryLoader::GetModuleHandleW;
    use windows::Win32::UI::Input::{
        GetRawInputData, RegisterRawInputDevices, HRAWINPUT, RAWINPUT, RAWINPUTDEVICE,
        RAWINPUTHEADER, RID_INPUT, RIDEV_INPUTSINK,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DefWindowProcW, DispatchMessageW, GetMessageW, RegisterClassW,
        HWND_MESSAGE, MSG, WINDOW_EX_STYLE, WINDOW_STYLE, WNDCLASSW, WM_INPUT,
    };

    thread_local! {
        // (callback, capture-start instant) for the message-loop thread.
        static CTX: RefCell<Option<(SharedSink, Instant)>> = RefCell::new(None);
    }

    // RAWMOUSE.usFlags: bit set => absolute coordinates (RDP, tablets).
    const MOUSE_MOVE_ABSOLUTE: u16 = 0x0001;
    // RAWINPUTHEADER.dwType for a mouse (RIM_TYPEMOUSE).
    const RIM_TYPEMOUSE: u32 = 0;

    pub fn spawn(sink: SharedSink, start: Instant) -> thread::JoinHandle<()> {
        thread::spawn(move || {
            CTX.with(|c| *c.borrow_mut() = Some((sink, start)));
            unsafe {
                if let Err(e) = run() {
                    eprintln!("raw mouse capture error: {e:?}");
                }
            }
        })
    }

    unsafe fn run() -> windows::core::Result<()> {
        let hinstance = GetModuleHandleW(None)?;
        let class_name = w!("RecoilPatternRecorderRawMouse");

        let wc = WNDCLASSW {
            lpfnWndProc: Some(wndproc),
            hInstance: hinstance.into(),
            lpszClassName: class_name,
            ..Default::default()
        };
        if RegisterClassW(&wc) == 0 {
            return Err(windows::core::Error::from_win32());
        }

        let hwnd = CreateWindowExW(
            WINDOW_EX_STYLE(0),
            class_name,
            w!(""),
            WINDOW_STYLE(0),
            0,
            0,
            0,
            0,
            Some(HWND_MESSAGE), // message-only window
            None,
            Some(hinstance.into()),
            None,
        )?;

        let rid = RAWINPUTDEVICE {
            usUsagePage: 0x01, // generic desktop controls
            usUsage: 0x02,     // mouse
            dwFlags: RIDEV_INPUTSINK,
            hwndTarget: hwnd,
        };
        RegisterRawInputDevices(&[rid], std::mem::size_of::<RAWINPUTDEVICE>() as u32)?;

        let mut msg = MSG::default();
        loop {
            let r = GetMessageW(&mut msg, Some(hwnd), 0, 0);
            if r.0 <= 0 {
                // 0 = WM_QUIT, -1 = error: stop the loop.
                break;
            }
            let _ = DispatchMessageW(&msg);
        }
        Ok(())
    }

    unsafe extern "system" fn wndproc(
        hwnd: HWND,
        msg: u32,
        wparam: WPARAM,
        lparam: LPARAM,
    ) -> LRESULT {
        if msg == WM_INPUT {
            handle_input(lparam);
        }
        DefWindowProcW(hwnd, msg, wparam, lparam)
    }

    unsafe fn handle_input(lparam: LPARAM) {
        let hri = HRAWINPUT(lparam.0 as *mut c_void);
        let header_size = std::mem::size_of::<RAWINPUTHEADER>() as u32;

        // Query the size, then read the record.
        let mut size: u32 = 0;
        if GetRawInputData(hri, RID_INPUT, None, &mut size, header_size) == u32::MAX || size == 0 {
            return;
        }
        // A mouse-only registration never produces packets larger than
        // RAWINPUT, but guard anyway: the second call below reports our
        // buffer as `size` bytes, so an oversized packet must be dropped
        // rather than risk writing past the stack buffer.
        if size as usize > std::mem::size_of::<RAWINPUT>() {
            return;
        }
        let mut raw = RAWINPUT::default();
        let got = GetRawInputData(
            hri,
            RID_INPUT,
            Some(&mut raw as *mut _ as *mut c_void),
            &mut size,
            header_size,
        );
        if got == 0 || got == u32::MAX {
            return;
        }
        if raw.header.dwType != RIM_TYPEMOUSE {
            return;
        }

        let mouse = raw.data.mouse;
        // Ignore absolute-coordinate devices (their lLastX/Y are not deltas).
        if (mouse.usFlags.0 & MOUSE_MOVE_ABSOLUTE) != 0 {
            return;
        }
        if mouse.lLastX == 0 && mouse.lLastY == 0 {
            return;
        }

        let dx = mouse.lLastX as f64;
        let dy = mouse.lLastY as f64;
        CTX.with(|c| {
            if let Some((sink, start)) = &*c.borrow() {
                let t_us = start.elapsed().as_micros() as u64;
                (sink.lock())(InputEvent::MouseMove { dx, dy, t_us });
            }
        });
    }
}
