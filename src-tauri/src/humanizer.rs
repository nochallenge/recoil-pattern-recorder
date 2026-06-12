// src-tauri/src/humanizer.rs
//
// Optional, self-contained transform that perturbs a recorded Pattern
// using its HumanizeConfig. NOT wired into the UI by default: construct a
// Humanizer and call `humanize()` to use it.

#![allow(dead_code)]

use crate::pattern::{HumanizeConfig, Pattern, PatternEvent};
use noise::{NoiseFn, Perlin};
use rand::Rng;

pub struct Humanizer {
    config: HumanizeConfig,
    perlin: Perlin,
    #[allow(dead_code)]
    seed: u32,
}

impl Humanizer {
    pub fn new(config: HumanizeConfig, seed: u32) -> Self {
        Self {
            config,
            perlin: Perlin::new(seed),
            seed,
        }
    }

    pub fn humanize(&self, pattern: &Pattern) -> Vec<PatternEvent> {
        let mut rng = rand::thread_rng();

        let disengage_at = rng.gen_range(
            self.config.disengage_shots_min..=self.config.disengage_shots_max,
        ) as usize;

        let first_delay_ms = rng.gen_range(
            self.config.first_shot_delay_ms_min..=self.config.first_shot_delay_ms_max,
        ) as i32;

        let drift_scale = self.config.drift_compensation_pct as f32 / 100.0;
        let jitter_mag = self.config.jitter_magnitude_pct as f32 / 100.0;
        let jitter_time = self.config.jitter_timing_ms as i32;

        let mut out = Vec::with_capacity(pattern.events.len());

        for (i, ev) in pattern.events.iter().enumerate() {
            if i >= disengage_at {
                break;
            }

            if rng.gen_range(0..100) < self.config.random_skip_chance_pct {
                continue;
            }

            let mag_mul = 1.0 + rng.gen_range(-jitter_mag..=jitter_mag);

            let tremor_x = self.perlin.get([ev.t_ms as f64 / 200.0, 0.0]) as f32
                * self.config.tremor_amplitude;
            let tremor_y = self.perlin.get([0.0, ev.t_ms as f64 / 200.0]) as f32
                * self.config.tremor_amplitude;

            let dx = ev.dx as f32 * drift_scale * mag_mul + tremor_x;
            let dy = ev.dy as f32 * drift_scale * mag_mul + tremor_y;

            let t_jitter = rng.gen_range(-jitter_time..=jitter_time);
            let t_ms = (ev.t_ms as i32 + first_delay_ms + t_jitter).max(0) as u32;

            out.push(PatternEvent {
                t_ms,
                dx: dx.round() as i32,
                dy: dy.round() as i32,
            });
        }

        out
    }
}
