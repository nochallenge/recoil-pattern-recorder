import { useEffect, useRef, useState } from "react";
import { api } from "../api";

/**
 * First-run walkthrough. Three panels:
 *  1. What the app does.
 *  2. Live capture test — so the user finds out NOW whether
 *     input capture works, not after recording an empty spray.
 *  3. Hotkey flow.
 */
export function OnboardingModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0);
  const [eventsPerSec, setEventsPerSec] = useState(0);
  const [totalEvents, setTotalEvents] = useState(0);
  const lastRef = useRef<number | null>(null);

  useEffect(() => {
    if (step !== 1) return;
    let cancelled = false;
    const tick = async () => {
      try {
        const n = await api.captureStats();
        if (cancelled) return;
        setTotalEvents(n);
        if (lastRef.current !== null) {
          setEventsPerSec(Math.round((n - lastRef.current) * 2));
        }
        lastRef.current = n;
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
  }, [step]);

  const captureWorking = totalEvents > 0;

  return (
    <div className="modal-overlay">
      <div className="modal" style={{ width: 560 }}>
        <div className="onboarding-progress">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`onboarding-dot ${i === step ? "active" : ""} ${i < step ? "done" : ""}`}
            />
          ))}
        </div>

        {step === 0 && (
          <>
            <h2>Welcome to Recoil Pattern Recorder</h2>
            <p>
              This app records your mouse movement while you counter recoil.
              You see the shape of your spray and whether you got better over
              time.
            </p>
            <p className="dim">
              It never sends input into any game. It only reads what your
              mouse does. You control when to arm and when to stop.
            </p>
            <div className="modal-actions">
              <button onClick={onClose}>Skip</button>
              <button className="primary" onClick={() => setStep(1)}>
                Next
              </button>
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h2>Test input capture</h2>
            <p className="dim" style={{ marginTop: -8 }}>
              Move your mouse. If the counter climbs, capture works.
              If it stays at zero, an anti-cheat or OS permission is
              blocking it — you will need to record outside of the
              affected game (aim trainers, practice ranges, desktop).
            </p>
            <div className="capture-indicator" data-working={captureWorking}>
              <div className="capture-dot" />
              <div>
                <div className="capture-rate">
                  {eventsPerSec} <span className="dim">events/sec</span>
                </div>
                <div className="capture-total dim">
                  {totalEvents} total
                </div>
              </div>
              <div className="capture-verdict">
                {captureWorking ? "Working" : "Nothing yet…"}
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setStep(0)}>Back</button>
              <button className="primary" onClick={() => setStep(2)}>
                {captureWorking ? "Next" : "Skip anyway"}
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2>How to record</h2>
            <ol style={{ paddingLeft: 20, lineHeight: 1.7 }}>
              <li>
                Press <kbd>F8</kbd> anywhere (in-game too) — a 3-2-1
                countdown plays with beeps.
              </li>
              <li>
                On GO, the recorder is armed. Hold <strong>Left Mouse</strong>{" "}
                while you fire and counter the recoil.
              </li>
              <li>
                Release Left Mouse. A tone confirms the recording is done.
              </li>
              <li>
                Press <kbd>F8</kbd> again to save, or alt-tab to review the
                preview first.
              </li>
            </ol>
            <p className="dim" style={{ fontSize: 12 }}>
              You can change the hotkey in Settings if F8 conflicts with a
              game bind.
            </p>
            <div className="modal-actions">
              <button onClick={() => setStep(1)}>Back</button>
              <button className="primary" onClick={onClose}>
                Start recording
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
