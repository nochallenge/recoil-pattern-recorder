// src-tauri/src/pattern.rs
//
// Pattern data structures. This JSON format is the contract between
// the desktop app and anything that consumes the pattern files.
// If you change it, existing saved patterns break — version carefully.

use serde::{Deserialize, Serialize};

/// A single mouse movement event in a recoil pattern.
/// Times are absolute ms from trigger-pull start.
/// dx/dy are raw mouse counts at the reference_dpi.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PatternEvent {
    pub t_ms: u32,
    pub dx: i32,
    pub dy: i32,
}

/// Optional humanization parameters consumed by humanizer.rs.
/// Part of the serialized Pattern schema.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct HumanizeConfig {
    pub jitter_magnitude_pct: u8,
    pub jitter_timing_ms: u8,
    pub drift_compensation_pct: u8,
    pub first_shot_delay_ms_min: u16,
    pub first_shot_delay_ms_max: u16,
    pub disengage_shots_min: u8,
    pub disengage_shots_max: u8,
    pub random_skip_chance_pct: u8,
    pub tremor_amplitude: f32,
}

impl Default for HumanizeConfig {
    fn default() -> Self {
        Self {
            jitter_magnitude_pct: 8,
            jitter_timing_ms: 15,
            drift_compensation_pct: 85,
            first_shot_delay_ms_min: 30,
            first_shot_delay_ms_max: 120,
            disengage_shots_min: 3,
            disengage_shots_max: 8,
            random_skip_chance_pct: 5,
            tremor_amplitude: 0.5,
        }
    }
}

/// A complete recoil pattern for one weapon.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Pattern {
    pub schema_version: u8,
    pub name: String,
    pub game: String,
    pub weapon: String,
    pub created_at: String,
    pub reference_sensitivity: f32,
    pub reference_dpi: u16,
    pub fire_rate_ms: u16,
    pub max_shots: u16,
    pub events: Vec<PatternEvent>,
    pub humanize: HumanizeConfig,
}

impl Pattern {
    pub fn new(name: String, game: String, weapon: String) -> Self {
        Self {
            schema_version: 1,
            name,
            game,
            weapon,
            created_at: chrono::Utc::now().to_rfc3339(),
            reference_sensitivity: 0.4,
            reference_dpi: 800,
            fire_rate_ms: 100,
            max_shots: 30,
            events: Vec::new(),
            humanize: HumanizeConfig::default(),
        }
    }

    /// Filename-safe slug derived from name. Not guaranteed unique.
    pub fn slug(&self) -> String {
        self.name
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '_' })
            .collect::<String>()
            .trim_matches('_')
            .to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_trip_json() {
        let mut p = Pattern::new("Test".into(), "valorant".into(), "vandal".into());
        p.events.push(PatternEvent { t_ms: 100, dx: -5, dy: 12 });
        p.events.push(PatternEvent { t_ms: 200, dx: -6, dy: 15 });

        let s = serde_json::to_string(&p).unwrap();
        let back: Pattern = serde_json::from_str(&s).unwrap();
        assert_eq!(p, back);
    }

    #[test]
    fn slug_is_filesystem_safe() {
        let mut p = Pattern::new("My Valorant / Vandal!".into(), "valorant".into(), "vandal".into());
        p.events.clear();
        assert_eq!(p.slug(), "my_valorant___vandal");
    }

    #[test]
    fn default_humanize_roundtrips() {
        let h = HumanizeConfig::default();
        let s = serde_json::to_string(&h).unwrap();
        let back: HumanizeConfig = serde_json::from_str(&s).unwrap();
        assert_eq!(h, back);
    }
}
