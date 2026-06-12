// Weapon metadata (fire rate + magazine size) for the recording form.
// Values are approximate in-game numbers — accurate enough to label a
// pattern, not precise enough for a physics sim. Users can (and
// should) edit any field manually before arming if the number feels
// off — these are a starting point, not authoritative.
//
// Fire modes get separate entries where the recoil differs
// (e.g. "Bulldog (auto)" vs "Bulldog (burst)").

export interface WeaponPreset {
  fire_rate_ms: number;
  max_shots: number;
}

export const GAMES = [
  { id: "bf6", label: "Battlefield 6" },
  { id: "fortnite", label: "Fortnite" },
  { id: "rivals", label: "Marvel Rivals" },
  { id: "swbf2", label: "Star Wars Battlefront II" },
  { id: "thefinals", label: "THE FINALS" },
  { id: "r6", label: "Rainbow Six Siege" },
  { id: "warzone", label: "COD Warzone" },
  { id: "other", label: "Other" },
] as const;

export const WEAPON_PRESETS: Record<string, Record<string, WeaponPreset>> = {
  // BATTLEFIELD 6 — new release; exact weapon roster + stats weren't
  // finalized in public sources when this file was written, so these
  // are modern-military archetypes you'll almost certainly encounter.
  // VERIFY fire rate + mag size against the in-game gunsmith screen
  // and edit the form before recording.
  bf6: {
    "M4A1 (AR)": { fire_rate_ms: 80, max_shots: 30 },
    "AK-74 (AR)": { fire_rate_ms: 80, max_shots: 30 },
    "SCAR-H (AR)": { fire_rate_ms: 100, max_shots: 20 },
    "HK416 (AR)": { fire_rate_ms: 80, max_shots: 30 },
    "AUG A3 (AR)": { fire_rate_ms: 85, max_shots: 30 },
    "MP7 (SMG)": { fire_rate_ms: 70, max_shots: 40 },
    "MP5 (SMG)": { fire_rate_ms: 75, max_shots: 30 },
    "P90 (SMG)": { fire_rate_ms: 67, max_shots: 50 },
    "Vector (SMG)": { fire_rate_ms: 55, max_shots: 25 },
    "UMP-45 (SMG)": { fire_rate_ms: 80, max_shots: 25 },
    "M249 (LMG)": { fire_rate_ms: 80, max_shots: 100 },
    "PKM (LMG)": { fire_rate_ms: 90, max_shots: 100 },
    "M60 (LMG)": { fire_rate_ms: 100, max_shots: 100 },
    "MCX Spear (battle rifle, semi)": { fire_rate_ms: 140, max_shots: 20 },
  },

  // FORTNITE — live-service, weapons rotate by chapter/season.
  // These are durable archetypes that usually exist in some form.
  // Fortnite stats also vary by rarity tier (common → mythic) and
  // wiki values are community estimates; tune to taste.
  fortnite: {
    "Assault Rifle (generic)": { fire_rate_ms: 100, max_shots: 30 },
    "Heavy AR (AK-like)": { fire_rate_ms: 110, max_shots: 30 },
    "Combat AR": { fire_rate_ms: 90, max_shots: 30 },
    "Ranger AR (burst)": { fire_rate_ms: 110, max_shots: 30 },
    "Hammer AR": { fire_rate_ms: 95, max_shots: 30 },
    "Havoc AR": { fire_rate_ms: 90, max_shots: 30 },
    "SMG (tactical)": { fire_rate_ms: 65, max_shots: 30 },
    "Rapid-fire SMG": { fire_rate_ms: 50, max_shots: 30 },
    "Combat SMG": { fire_rate_ms: 60, max_shots: 30 },
    "Sidearm (pistol, auto)": { fire_rate_ms: 85, max_shots: 16 },
    "MK-Seven AR": { fire_rate_ms: 90, max_shots: 30 },
  },

  // MARVEL RIVALS — hero shooter; most characters use abilities, not
  // bullet weapons with recoil. Only include heroes with something
  // resembling a traditional spray pattern. For ability-based heroes
  // (Iron Man beams, Scarlet Witch, Hela, etc.) this app isn't the
  // right training tool.
  rivals: {
    "Punisher — AR (Adjudicator)": { fire_rate_ms: 80, max_shots: 30 },
    "Punisher — shotgun (Deliverer)": { fire_rate_ms: 700, max_shots: 6 },
    "Winter Soldier — Bionic Hook rifle": { fire_rate_ms: 280, max_shots: 8 },
    "Star-Lord — dual elemental blasters": { fire_rate_ms: 80, max_shots: 40 },
    "Rocket Raccoon — rifle": { fire_rate_ms: 150, max_shots: 30 },
    "Hawkeye — bow (rapid)": { fire_rate_ms: 500, max_shots: 1 },
    "Black Widow — Red Room rifle (semi)": { fire_rate_ms: 400, max_shots: 15 },
  },

  // STAR WARS BATTLEFRONT II — 2017 EA release. Blasters have recoil.
  // Values estimated from community wikis; card + hero-specific
  // blasters behave similarly enough to the base weapon for training.
  swbf2: {
    // Assault class
    "E-11 (Assault)": { fire_rate_ms: 115, max_shots: 25 },
    "A280-CFE (Assault)": { fire_rate_ms: 100, max_shots: 15 },
    "F-11D (Assault)": { fire_rate_ms: 130, max_shots: 20 },
    "EL-16HFE (Assault, rapid-semi)": { fire_rate_ms: 180, max_shots: 18 },
    // Heavy class
    "DC-15LE (Heavy LMG)": { fire_rate_ms: 130, max_shots: 28 },
    "T-21B (Heavy rapid)": { fire_rate_ms: 100, max_shots: 15 },
    "FWMB-10K (Heavy LMG)": { fire_rate_ms: 115, max_shots: 30 },
    "M-45 (Heavy)": { fire_rate_ms: 150, max_shots: 15 },
    // Officer class
    "S-5 (Officer semi)": { fire_rate_ms: 200, max_shots: 14 },
    "SE-44C (Officer)": { fire_rate_ms: 180, max_shots: 20 },
    "Blurrg-1120 (Officer)": { fire_rate_ms: 220, max_shots: 12 },
    // Specialist class
    "NT-242 (Specialist, charge)": { fire_rate_ms: 900, max_shots: 5 },
    "IQA-11 (Specialist, semi)": { fire_rate_ms: 220, max_shots: 8 },
    // SMG-like
    "CR-2 (hero/trait SMG)": { fire_rate_ms: 65, max_shots: 20 },
  },

  // THE FINALS — Embark Studios. Live-service; values patch often.
  // Verify in-game if they feel off and edit the form.
  thefinals: {
    // Light
    "M11 (Light, SMG)": { fire_rate_ms: 80, max_shots: 20 },
    "XP-54 (Light, SMG)": { fire_rate_ms: 83, max_shots: 20 },
    "V9S (Light, pistol)": { fire_rate_ms: 120, max_shots: 13 },
    "93R (Light, burst pistol)": { fire_rate_ms: 110, max_shots: 24 },
    "LH1 (Light, DMR)": { fire_rate_ms: 180, max_shots: 12 },
    "SH1900 (Light, shotgun)": { fire_rate_ms: 900, max_shots: 2 },
    "SR-84 (Light, bolt sniper)": { fire_rate_ms: 1400, max_shots: 5 },
    // Medium
    "AKM (Medium, AR)": { fire_rate_ms: 120, max_shots: 25 },
    "FCAR (Medium, AR)": { fire_rate_ms: 94, max_shots: 20 },
    "Pike-556 (Medium, semi AR)": { fire_rate_ms: 150, max_shots: 20 },
    "R.357 (Medium, revolver)": { fire_rate_ms: 260, max_shots: 6 },
    "Model 1887 (Medium, lever shotgun)": { fire_rate_ms: 440, max_shots: 5 },
    "CB-01 Repeater (Medium, lever carbine)": { fire_rate_ms: 140, max_shots: 8 },
    "CL-40 (Medium, grenade launcher)": { fire_rate_ms: 500, max_shots: 4 },
    // Heavy
    "Lewis Gun (Heavy, LMG)": { fire_rate_ms: 109, max_shots: 47 },
    "M60 (Heavy, LMG)": { fire_rate_ms: 98, max_shots: 50 },
    "SA 1216 (Heavy, auto shotgun)": { fire_rate_ms: 200, max_shots: 16 },
    "KS-23 (Heavy, slug shotgun)": { fire_rate_ms: 1100, max_shots: 4 },
    ".50 Akimbo (Heavy, dual pistols)": { fire_rate_ms: 120, max_shots: 12 },
    "Flamethrower (Heavy)": { fire_rate_ms: 60, max_shots: 100 },
    "M32 GL (Heavy, grenade launcher)": { fire_rate_ms: 400, max_shots: 6 },
  },

  r6: {
    // Attacker ARs (common picks)
    "R4-C (Ash)": { fire_rate_ms: 75, max_shots: 25 },
    "556xi (Thermite)": { fire_rate_ms: 70, max_shots: 30 },
    "416-C (Jäger)": { fire_rate_ms: 70, max_shots: 25 },
    "AR33 (Thatcher)": { fire_rate_ms: 75, max_shots: 25 },
    "AUG A2 (IQ)": { fire_rate_ms: 80, max_shots: 30 },
    "C8-SFW (Buck)": { fire_rate_ms: 75, max_shots: 30 },
    "AK-12 (Fuze)": { fire_rate_ms: 75, max_shots: 30 },
    // SMGs / PDWs
    "MP5 (Rook/Doc)": { fire_rate_ms: 75, max_shots: 30 },
    "MP7 (GSG9)": { fire_rate_ms: 70, max_shots: 30 },
    "SMG-11 (Smoke)": { fire_rate_ms: 50, max_shots: 16 },
    "SMG-12 (Dokkaebi)": { fire_rate_ms: 55, max_shots: 32 },
    "T-5 SMG (Kaid)": { fire_rate_ms: 67, max_shots: 30 },
    "Commando 9 (Castle)": { fire_rate_ms: 75, max_shots: 30 },
    // LMGs
    "LMG-E (Amaru)": { fire_rate_ms: 75, max_shots: 80 },
    "M249 (Capitão)": { fire_rate_ms: 80, max_shots: 80 },
    "DP27 (Tachanka)": { fire_rate_ms: 85, max_shots: 40 },
    "G8A1 (IQ)": { fire_rate_ms: 70, max_shots: 50 },
  },

  // COD WARZONE — live-service; weapon meta shifts every season.
  // These are core common weapons that survive across seasons. Check
  // the in-game stats screen if the season rebalanced something.
  warzone: {
    "M4 (AR)": { fire_rate_ms: 80, max_shots: 30 },
    "AK-47 (AR)": { fire_rate_ms: 100, max_shots: 30 },
    "MTZ-556 (AR)": { fire_rate_ms: 85, max_shots: 30 },
    "RAM-7 (AR)": { fire_rate_ms: 60, max_shots: 30 },
    "Holger 556 (AR)": { fire_rate_ms: 85, max_shots: 30 },
    "SVA 545 (burst AR)": { fire_rate_ms: 120, max_shots: 30 },
    "BP50 (AR)": { fire_rate_ms: 70, max_shots: 30 },
    "MP5 (SMG)": { fire_rate_ms: 75, max_shots: 30 },
    "MP7 (SMG)": { fire_rate_ms: 70, max_shots: 40 },
    "Striker (SMG)": { fire_rate_ms: 60, max_shots: 30 },
    "AMR9 (SMG)": { fire_rate_ms: 65, max_shots: 30 },
    "WSP Swarm (SMG)": { fire_rate_ms: 50, max_shots: 50 },
    "HRM-9 (SMG)": { fire_rate_ms: 60, max_shots: 30 },
    "RPK (LMG)": { fire_rate_ms: 100, max_shots: 75 },
    "Pulemyot 762 (LMG)": { fire_rate_ms: 95, max_shots: 100 },
    "DG-58 LSW (LMG)": { fire_rate_ms: 85, max_shots: 75 },
    "Kar98k (marksman)": { fire_rate_ms: 600, max_shots: 5 },
    "HDR (sniper)": { fire_rate_ms: 1200, max_shots: 7 },
    "AX-50 (sniper)": { fire_rate_ms: 1000, max_shots: 5 },
  },

  other: {},
};

export function presetsFor(game: string): string[] {
  return Object.keys(WEAPON_PRESETS[game] ?? {});
}

export function lookupPreset(game: string, weapon: string): WeaponPreset | null {
  return WEAPON_PRESETS[game]?.[weapon] ?? null;
}
