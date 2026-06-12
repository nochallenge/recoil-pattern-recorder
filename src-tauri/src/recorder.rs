// src-tauri/src/recorder.rs
//
// State machine that consumes InputEvents and produces a Pattern.
// Arm: prime the recorder. Record: left-mouse-down begins, deltas
// are accumulated per event. Done: left-mouse-up, or explicit stop.
//
// Events are stored at the native OS event rate (no downsampling).
// The frontend decimates for display; the raw timestamps preserve
// the original timing for analysis.

use crate::input_capture::InputEvent;
use crate::pattern::{Pattern, PatternEvent};

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RecordingState {
    Idle,
    Armed,
    Recording,
    Done,
}

pub struct Recorder {
    state: RecordingState,
    pattern: Pattern,
    trigger_start_us: Option<u64>,
}

impl Recorder {
    pub fn new(pattern: Pattern) -> Self {
        Self {
            state: RecordingState::Idle,
            pattern,
            trigger_start_us: None,
        }
    }

    pub fn arm(&mut self) {
        self.state = RecordingState::Armed;
        self.pattern.events.clear();
        self.trigger_start_us = None;
    }

    pub fn stop(&mut self) {
        self.state = RecordingState::Done;
    }

    pub fn state(&self) -> RecordingState {
        self.state
    }

    pub fn pattern(&self) -> &Pattern {
        &self.pattern
    }

    /// Feed one input event. Returns true if the recording state changed.
    pub fn feed(&mut self, ev: &InputEvent) -> bool {
        match (self.state, ev) {
            (RecordingState::Armed, InputEvent::ButtonPress { button, t_us })
                if button == "Left" =>
            {
                self.state = RecordingState::Recording;
                self.trigger_start_us = Some(*t_us);
                true
            }
            (RecordingState::Recording, InputEvent::ButtonRelease { button, .. })
                if button == "Left" =>
            {
                self.stop();
                true
            }
            (RecordingState::Recording, InputEvent::MouseMove { dx, dy, t_us }) => {
                // Invariant: trigger_start_us is set on every Armed->Recording
                // transition, so it's Some whenever state == Recording.
                let start = self
                    .trigger_start_us
                    .expect("trigger_start_us must be set while Recording");
                let t_ms = t_us.saturating_sub(start) / 1000;
                self.pattern.events.push(PatternEvent {
                    t_ms: t_ms as u32,
                    dx: dx.round() as i32,
                    dy: dy.round() as i32,
                });
                false
            }
            _ => false,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn press_left(t_us: u64) -> InputEvent {
        InputEvent::ButtonPress { button: "Left".into(), t_us }
    }
    fn release_left(_t_us: u64) -> InputEvent {
        InputEvent::ButtonRelease { button: "Left".into() }
    }
    fn mov(dx: f64, dy: f64, t_us: u64) -> InputEvent {
        InputEvent::MouseMove { dx, dy, t_us }
    }

    #[test]
    fn armed_ignores_mouse_until_click() {
        let mut r = Recorder::new(Pattern::new("t".into(), "g".into(), "w".into()));
        r.arm();
        r.feed(&mov(5.0, 0.0, 100));
        assert_eq!(r.state(), RecordingState::Armed);
        assert!(r.pattern().events.is_empty());
    }

    #[test]
    fn click_starts_recording_release_stops_it() {
        let mut r = Recorder::new(Pattern::new("t".into(), "g".into(), "w".into()));
        r.arm();
        assert!(r.feed(&press_left(1_000_000)));
        assert_eq!(r.state(), RecordingState::Recording);
        r.feed(&mov(-3.0, 7.0, 1_100_000));
        r.feed(&mov(-2.0, 5.0, 1_200_000));
        assert!(r.feed(&release_left(1_300_000)));
        assert_eq!(r.state(), RecordingState::Done);
        assert_eq!(r.pattern().events.len(), 2);
        assert_eq!(r.pattern().events[0].t_ms, 100);
        assert_eq!(r.pattern().events[1].t_ms, 200);
    }

    #[test]
    fn right_button_is_ignored() {
        let mut r = Recorder::new(Pattern::new("t".into(), "g".into(), "w".into()));
        r.arm();
        r.feed(&InputEvent::ButtonPress { button: "Right".into(), t_us: 500 });
        assert_eq!(r.state(), RecordingState::Armed);
    }

    #[test]
    fn deltas_not_clipped_at_i16_range() {
        let mut r = Recorder::new(Pattern::new("t".into(), "g".into(), "w".into()));
        r.arm();
        r.feed(&press_left(0));
        r.feed(&mov(40_000.0, -40_000.0, 1000));
        let ev = &r.pattern().events[0];
        assert_eq!(ev.dx, 40_000);
        assert_eq!(ev.dy, -40_000);
    }
}
