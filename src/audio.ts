// Short synthesized beeps for countdown + state-transition feedback.
// Uses Web Audio so we don't need to ship .wav files. Browsers will
// silently ignore calls if the user hasn't interacted yet — beeps
// always follow a click/keypress, so we're fine.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (ctx) return ctx;
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    ctx = new AC();
    return ctx;
  } catch {
    return null;
  }
}

function beep(frequency: number, durationMs: number, volume = 0.25) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.frequency.value = frequency;
  osc.type = "sine";
  const now = c.currentTime;
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + durationMs / 1000);
  osc.start(now);
  osc.stop(now + durationMs / 1000);
}

export const sounds = {
  countdownTick: () => beep(660, 80),
  countdownGo: () => beep(880, 140),
  recordingStart: () => beep(1200, 80),
  recordingDone: () => { beep(880, 60); setTimeout(() => beep(660, 120), 70); },
  cancel: () => beep(330, 140),
};
