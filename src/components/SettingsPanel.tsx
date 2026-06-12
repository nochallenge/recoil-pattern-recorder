import { useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * Settings + live capture diagnostic.
 *
 * The capture-test readout is the important part: if rdev is being
 * suppressed by an anti-cheat (or the user hasn't granted accessibility
 * on macOS), the event counter will not tick. The user sees that
 * immediately instead of after recording an empty spray.
 */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const [hotkey, setHotkey] = useState("F8");
  const [newHotkey, setNewHotkey] = useState("");
  const [listening, setListening] = useState(false);
  const [eventsPerSec, setEventsPerSec] = useState(0);
  const [totalEvents, setTotalEvents] = useState<number | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  const lastCountRef = useRef<number | null>(null);

  useEffect(() => {
    api.getHotkey().then(setHotkey).catch(() => {});
  }, []);

  // Poll capture stats every 500ms; derive events/sec from the delta.
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await api.captureStats();
        if (cancelled) return;
        setTotalEvents(n);
        if (lastCountRef.current !== null) {
          setEventsPerSec(Math.round((n - lastCountRef.current) * 2));
        }
        lastCountRef.current = n;
      } catch {
        /* noop */
      }
    };
    tick();
    const id = window.setInterval(tick, 500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  // When listening for a new hotkey, capture the next keydown.
  useEffect(() => {
    if (!listening) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      // Map DOM KeyboardEvent.key to rdev Debug name for common keys.
      const rdevName = domKeyToRdev(e.key, e.code);
      if (rdevName) {
        setNewHotkey(rdevName);
        setListening(false);
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [listening]);

  const saveHotkey = async () => {
    const target = newHotkey.trim();
    if (!target) return;
    try {
      await api.setHotkey(target);
      setHotkey(target);
      setNewHotkey("");
      setSaveStatus("Saved.");
      setTimeout(() => setSaveStatus(null), 1500);
    } catch (e) {
      setSaveStatus(`Error: ${e}`);
    }
  };

  const captureWorking = eventsPerSec > 0 || (totalEvents ?? 0) > 0;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 520 }}>
        <h2>Settings</h2>

        <section className="settings-section">
          <h3>Capture diagnostic</h3>
          <p className="dim" style={{ fontSize: 12, marginTop: -4 }}>
            Move your mouse. If the counter does not tick,{" "}
            <strong>the OS is blocking input capture</strong> — usually
            anti-cheat in fullscreen, or missing accessibility permissions
            on macOS.
          </p>
          <div className="capture-indicator" data-working={captureWorking}>
            <div className="capture-dot" />
            <div>
              <div className="capture-rate">
                {eventsPerSec} <span className="dim">events/sec</span>
              </div>
              <div className="capture-total dim">
                {totalEvents ?? "—"} total since launch
              </div>
            </div>
            <div className="capture-verdict">
              {captureWorking ? "Capture OK" : "Not receiving"}
            </div>
          </div>
        </section>

        <section className="settings-section">
          <h3>Global hotkey</h3>
          <p className="dim" style={{ fontSize: 12, marginTop: -4 }}>
            Fires arm / stop / save while any app is focused. Pick a key
            that does not conflict with your in-game binds.
          </p>
          <div className="row">
            <div className="grow">
              <div style={{ fontSize: 11, color: "var(--text-dim)" }}>
                Current
              </div>
              <div style={{ fontSize: 16, fontWeight: 500 }}>
                <kbd>{hotkey}</kbd>
              </div>
            </div>
            {listening ? (
              <button
                className="danger"
                onClick={() => setListening(false)}
              >
                Press any key… (cancel)
              </button>
            ) : (
              <button onClick={() => setListening(true)}>
                Rebind
              </button>
            )}
          </div>
          {newHotkey && !listening && (
            <div className="row" style={{ marginTop: 12 }}>
              <div className="grow">
                New: <kbd>{newHotkey}</kbd>
              </div>
              <button className="primary" onClick={saveHotkey}>
                Save
              </button>
            </div>
          )}
          {saveStatus && (
            <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
              {saveStatus}
            </div>
          )}
        </section>

        <div className="modal-actions">
          <button className="primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Map a DOM KeyboardEvent to the rdev Debug-name of the same key.
 * Covers the keys a user would realistically bind as a global hotkey
 * (function keys, numpad, letters). Returns null for modifiers or
 * unmapped keys so we do not bind Alt/Shift/Ctrl alone.
 */
function domKeyToRdev(key: string, code: string): string | null {
  if (/^F([1-9]|1[0-2])$/.test(key)) return key;
  if (/^Key[A-Z]$/.test(code)) return code;
  const digitMatch = /^Digit([0-9])$/.exec(code);
  if (digitMatch) return `Num${digitMatch[1]}`;
  const map: Record<string, string> = {
    Escape: "Escape",
    Tab: "Tab",
    Space: "Space",
    Enter: "Return",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
  };
  if (map[key]) return map[key];
  return null;
}
