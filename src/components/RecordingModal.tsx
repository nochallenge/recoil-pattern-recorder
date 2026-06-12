import { useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { api } from "../api";
import { sounds } from "../audio";
import { loadDefaults, saveDefaults } from "../settings";
import { GAMES, lookupPreset, presetsFor } from "../weapon-presets";
import type { NewRecordingInput, Pattern, RecordingState } from "../types";
import { PatternVisualizer } from "./PatternVisualizer";

type Phase = "form" | "countdown" | "armed" | "recording" | "done";

const BASE_FORM: NewRecordingInput = {
  name: "",
  game: "thefinals",
  weapon: "FCAR (Medium, AR)",
  reference_sensitivity: 0.4,
  reference_dpi: 800,
  fire_rate_ms: 94,
  max_shots: 20,
};

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function autoName(f: NewRecordingInput): string {
  const stamp = new Date().toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${f.weapon || "spray"} · ${stamp}`;
}

export function RecordingModal({
  onSaved,
  onClose,
  autoArm = false,
}: {
  onSaved: (filename: string) => void;
  onClose: () => void;
  /** If true, skip the form and go straight to countdown/arm on mount. */
  autoArm?: boolean;
}) {
  const initialForm: NewRecordingInput = {
    ...BASE_FORM,
    ...(loadDefaults() ?? {}),
  };

  const [phase, setPhase] = useState<Phase>(autoArm ? "countdown" : "form");
  const [form, setForm] = useState<NewRecordingInput>(initialForm);
  const [eventCount, setEventCount] = useState(0);
  const [durationMs, setDurationMs] = useState(0);
  const [donePattern, setDonePattern] = useState<Pattern | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [countdownTick, setCountdownTick] = useState(3);

  const mountedRef = useRef(true);
  const lastHandledRef = useRef<RecordingState | null>(null);
  // Stable refs for F8 hotkey handler so one subscription works for
  // the whole modal lifetime and always dispatches on the latest phase.
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const hotkeyHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Subscribe once to backend state-change events.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;
    api.onStateChange((s) => {
      if (cancelled) return;
      handleStateChange(s);
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe once to global F8 hotkey; handler ref routes by phase.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;
    api.onHotkey(() => {
      if (cancelled) return;
      hotkeyHandlerRef.current();
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  // Poll for event count while armed or recording.
  useEffect(() => {
    if (phase !== "armed" && phase !== "recording") return;
    const id = window.setInterval(async () => {
      try {
        const status = await api.recordingStatus();
        setEventCount(status.event_count);
        setDurationMs(status.duration_ms);
        if (
          status.state !== phase &&
          (status.state === "recording" || status.state === "done")
        ) {
          handleStateChange(status.state);
        }
      } catch {
        /* backend cleared state — ignore */
      }
    }, 100);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // Countdown effect: when entering "countdown" phase, run 3-2-1-go
  // and then arm the backend. AbortController cleans up in StrictMode.
  useEffect(() => {
    if (phase !== "countdown") return;
    const controller = new AbortController();
    runCountdown(controller.signal);
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  async function runCountdown(signal: AbortSignal) {
    for (let i = 3; i > 0; i--) {
      if (signal.aborted) return;
      setCountdownTick(i);
      sounds.countdownTick();
      await sleep(700);
    }
    if (signal.aborted) return;
    sounds.countdownGo();
    const name = form.name.trim() || autoName(form);
    try {
      saveDefaults(form);
      await api.startRecording({ ...form, name });
      if (signal.aborted) {
        await api.cancelRecording().catch(() => {});
        return;
      }
      lastHandledRef.current = null;
      setPhase("armed");
    } catch (e) {
      if (signal.aborted) return;
      setError(String(e));
      setPhase("form");
    }
  }

  const handleStateChange = async (s: RecordingState) => {
    if (!mountedRef.current) return;
    if (lastHandledRef.current === s) return;
    lastHandledRef.current = s;
    if (s === "recording") {
      sounds.recordingStart();
      setPhase("recording");
    }
    if (s === "done") {
      sounds.recordingDone();
      setPhase("done");
      try {
        const p = await api.currentPattern();
        if (!mountedRef.current) return;
        setDonePattern(p);
        setEventCount(p.events.length);
        setDurationMs(p.events[p.events.length - 1]?.t_ms ?? 0);
      } catch (e) {
        if (!mountedRef.current) return;
        setError(String(e));
      }
    }
  };

  const handleArm = () => {
    setError(null);
    setCountdownTick(3);
    setPhase("countdown");
  };

  const handleStop = async () => {
    try {
      const p = await api.stopRecording();
      setDonePattern(p);
      setEventCount(p.events.length);
      setDurationMs(p.events[p.events.length - 1]?.t_ms ?? 0);
      setPhase("done");
      lastHandledRef.current = "done";
      sounds.recordingDone();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleCancel = async () => {
    try {
      await api.cancelRecording();
    } catch {
      /* noop */
    }
    sounds.cancel();
    onClose();
  };

  const handleSave = async () => {
    if (!donePattern) return;
    try {
      const filename = await api.savePattern(donePattern);
      await api.cancelRecording();
      onSaved(filename);
    } catch (e) {
      setError(String(e));
    }
  };

  const handleRetry = async () => {
    try {
      await api.cancelRecording();
    } catch {
      /* noop */
    }
    setDonePattern(null);
    setEventCount(0);
    setDurationMs(0);
    setPhase("form");
    lastHandledRef.current = null;
  };

  // Route F8 based on latest phase.
  hotkeyHandlerRef.current = () => {
    const p = phaseRef.current;
    if (p === "form") handleArm();
    else if (p === "countdown" || p === "armed") handleCancel();
    else if (p === "recording") handleStop();
    else if (p === "done") handleSave();
  };

  return (
    <div className="modal-overlay">
      <div
        className="modal"
        style={phase === "done" ? { width: 720 } : {}}
      >
        {phase === "form" && (
          <FormPhase
            form={form}
            onChange={setForm}
            onArm={handleArm}
            onCancel={handleCancel}
            error={error}
          />
        )}

        {phase === "countdown" && (
          <CountdownPhase tick={countdownTick} onCancel={handleCancel} />
        )}

        {(phase === "armed" || phase === "recording") && (
          <LivePhase
            phase={phase}
            eventCount={eventCount}
            durationMs={durationMs}
            onStop={handleStop}
            onCancel={handleCancel}
          />
        )}

        {phase === "done" && donePattern && (
          <DonePhase
            pattern={donePattern}
            onSave={handleSave}
            onRetry={handleRetry}
            onCancel={handleCancel}
            error={error}
          />
        )}
      </div>
    </div>
  );
}

// ---------------- sub-views ----------------

function FormPhase({
  form,
  onChange,
  onArm,
  onCancel,
  error,
}: {
  form: NewRecordingInput;
  onChange: (f: NewRecordingInput) => void;
  onArm: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  const weaponOptions = presetsFor(form.game);
  const isCustomWeapon =
    form.game === "other" ||
    (weaponOptions.length > 0 && !weaponOptions.includes(form.weapon));

  const onGameChange = (game: string) => {
    const options = presetsFor(game);
    const weapon = options[0] ?? form.weapon;
    const preset = lookupPreset(game, weapon);
    onChange({
      ...form,
      game,
      weapon,
      fire_rate_ms: preset?.fire_rate_ms ?? form.fire_rate_ms,
      max_shots: preset?.max_shots ?? form.max_shots,
    });
  };

  const onWeaponChange = (weapon: string) => {
    if (weapon === "__custom__") {
      onChange({ ...form, weapon: "" });
      return;
    }
    const preset = lookupPreset(form.game, weapon);
    onChange({
      ...form,
      weapon,
      fire_rate_ms: preset?.fire_rate_ms ?? form.fire_rate_ms,
      max_shots: preset?.max_shots ?? form.max_shots,
    });
  };

  return (
    <>
      <h2>New Recording</h2>
      <p className="dim" style={{ marginTop: -8, marginBottom: 16 }}>
        Arm the recorder, then hold Left Mouse to record your spray.
        Press <kbd>F8</kbd> anywhere to arm/stop without leaving your game.
      </p>

      <div className="form-grid">
        <div className="full">
          <label>Pattern name <span className="dim">(optional)</span></label>
          <input
            value={form.name}
            onChange={(e) => onChange({ ...form, name: e.target.value })}
            placeholder="auto-generated if left blank"
            autoFocus
          />
        </div>

        <div>
          <label>Game</label>
          <select
            value={form.game}
            onChange={(e) => onGameChange(e.target.value)}
          >
            {GAMES.map((g) => (
              <option key={g.id} value={g.id}>{g.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label>Weapon</label>
          {weaponOptions.length > 0 ? (
            <select
              value={isCustomWeapon ? "__custom__" : form.weapon}
              onChange={(e) => onWeaponChange(e.target.value)}
            >
              {weaponOptions.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
              <option value="__custom__">Custom…</option>
            </select>
          ) : (
            <input
              value={form.weapon}
              onChange={(e) => onChange({ ...form, weapon: e.target.value })}
              placeholder="e.g. ak47"
            />
          )}
        </div>

        {isCustomWeapon && weaponOptions.length > 0 && (
          <div className="full">
            <label>Custom weapon name</label>
            <input
              value={form.weapon}
              onChange={(e) => onChange({ ...form, weapon: e.target.value })}
              placeholder="e.g. operator"
            />
          </div>
        )}

        <div>
          <label>In-game sens</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={form.reference_sensitivity}
            onChange={(e) =>
              onChange({
                ...form,
                reference_sensitivity: parseFloat(e.target.value) || 0,
              })
            }
          />
        </div>

        <div>
          <label>Mouse DPI</label>
          <input
            type="number"
            step="100"
            min="100"
            value={form.reference_dpi}
            onChange={(e) =>
              onChange({ ...form, reference_dpi: parseInt(e.target.value) || 0 })
            }
          />
        </div>

        <div>
          <label>
            Fire rate (ms) <span className="dim">auto</span>
          </label>
          <input
            type="number"
            step="1"
            min="1"
            value={form.fire_rate_ms}
            onChange={(e) =>
              onChange({ ...form, fire_rate_ms: parseInt(e.target.value) || 1 })
            }
          />
        </div>

        <div>
          <label>
            Mag size <span className="dim">auto</span>
          </label>
          <input
            type="number"
            step="1"
            min="1"
            value={form.max_shots}
            onChange={(e) =>
              onChange({ ...form, max_shots: parseInt(e.target.value) || 1 })
            }
          />
        </div>
      </div>

      {error && (
        <div style={{ color: "var(--danger)", marginTop: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="modal-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="primary" onClick={onArm}>
          Arm Recorder <span className="hotkey">F8</span>
        </button>
      </div>
    </>
  );
}

function CountdownPhase({
  tick,
  onCancel,
}: {
  tick: number;
  onCancel: () => void;
}) {
  return (
    <>
      <h2>Get ready</h2>
      <p className="dim" style={{ marginTop: -8 }}>
        Alt-tab to the game now. Recorder arms after the countdown.
      </p>
      <div className="countdown">
        <div className="countdown-num">{tick > 0 ? tick : "GO"}</div>
      </div>
      <div className="modal-actions">
        <button className="danger" onClick={onCancel}>
          Cancel <span className="hotkey">F8</span>
        </button>
      </div>
    </>
  );
}

function LivePhase({
  phase,
  eventCount,
  durationMs,
  onStop,
  onCancel,
}: {
  phase: "armed" | "recording";
  eventCount: number;
  durationMs: number;
  onStop: () => void;
  onCancel: () => void;
}) {
  return (
    <>
      <h2>{phase === "armed" ? "Armed" : "Recording"}</h2>

      <div className={`recording-status ${phase}`}>
        {phase === "armed"
          ? "Hold Left Mouse to start recording"
          : "● Recording — release Left Mouse to stop"}
      </div>

      <div className="stat-row">
        <div className="stat">
          <div className="label">Events</div>
          <div className="value">{eventCount}</div>
        </div>
        <div className="stat">
          <div className="label">Duration</div>
          <div className="value">{(durationMs / 1000).toFixed(2)}s</div>
        </div>
      </div>

      <p className="dim" style={{ fontSize: 12 }}>
        Press <kbd>F8</kbd> to {phase === "recording" ? "force-stop" : "cancel"}.
      </p>

      <div className="modal-actions">
        <button className="danger" onClick={onCancel}>
          Cancel
        </button>
        {phase === "recording" && (
          <button onClick={onStop}>Force Stop</button>
        )}
      </div>
    </>
  );
}

function DonePhase({
  pattern,
  onSave,
  onRetry,
  onCancel,
  error,
}: {
  pattern: Pattern;
  onSave: () => void;
  onRetry: () => void;
  onCancel: () => void;
  error: string | null;
}) {
  return (
    <>
      <h2>Recording Complete</h2>
      <p className="dim" style={{ marginTop: -8, marginBottom: 16 }}>
        Preview below. Save to keep it, Retry for another take.
        Press <kbd>F8</kbd> to save.
      </p>

      <PatternVisualizer pattern={pattern} compact />

      {error && (
        <div style={{ color: "var(--danger)", marginTop: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="modal-actions">
        <button onClick={onCancel}>Discard</button>
        <button onClick={onRetry}>Retry</button>
        <button className="primary" onClick={onSave}>
          Save Pattern
        </button>
      </div>
    </>
  );
}
