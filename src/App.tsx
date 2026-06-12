import { useCallback, useEffect, useRef, useState } from "react";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { api } from "./api";
import { hasOnboarded, markOnboarded } from "./settings";
import type { Pattern, PatternSummary } from "./types";
import { PatternList } from "./components/PatternList";
import { PatternVisualizer } from "./components/PatternVisualizer";
import { RecordingModal } from "./components/RecordingModal";
import { SettingsPanel } from "./components/SettingsPanel";
import { OnboardingModal } from "./components/OnboardingModal";

export default function App() {
  const [patterns, setPatterns] = useState<PatternSummary[]>([]);
  const [selectedFilename, setSelectedFilename] = useState<string | null>(null);
  const [selectedPattern, setSelectedPattern] = useState<Pattern | null>(null);
  const [compareFilename, setCompareFilename] = useState<string | null>(null);
  const [comparePattern, setComparePattern] = useState<Pattern | null>(null);
  const [patternsDir, setPatternsDir] = useState<string>("");
  const [modalOpen, setModalOpen] = useState(false);
  const [modalAutoArm, setModalAutoArm] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(!hasOnboarded());
  const [error, setError] = useState<string | null>(null);

  const importInputRef = useRef<HTMLInputElement>(null);

  const modalOpenRef = useRef(modalOpen);
  modalOpenRef.current = modalOpen;
  const anyOverlayOpenRef = useRef(false);
  anyOverlayOpenRef.current = modalOpen || settingsOpen || onboardingOpen;

  const refreshList = useCallback(async () => {
    try {
      setPatterns(await api.listPatterns());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    refreshList();
    api.patternsDir().then(setPatternsDir).catch(() => {});
  }, [refreshList]);

  useEffect(() => {
    if (!selectedFilename) {
      setSelectedPattern(null);
      return;
    }
    let cancelled = false;
    api.loadPattern(selectedFilename).then(
      (p) => { if (!cancelled) setSelectedPattern(p); },
      (e) => { if (!cancelled) setError(String(e)); }
    );
    return () => { cancelled = true; };
  }, [selectedFilename]);

  useEffect(() => {
    if (!compareFilename) {
      setComparePattern(null);
      return;
    }
    let cancelled = false;
    api.loadPattern(compareFilename).then(
      (p) => { if (!cancelled) setComparePattern(p); },
      () => { /* compare target missing - just clear */ }
    );
    return () => { cancelled = true; };
  }, [compareFilename]);

  // Global hotkey: open modal + auto-arm if no overlay is already open.
  useEffect(() => {
    let cancelled = false;
    let unlisten: UnlistenFn | undefined;
    api.onHotkey(() => {
      if (cancelled) return;
      if (!anyOverlayOpenRef.current) {
        setModalAutoArm(true);
        setModalOpen(true);
      }
    }).then((un) => {
      if (cancelled) un();
      else unlisten = un;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const handleSaved = async (filename: string) => {
    await refreshList();
    setSelectedFilename(filename);
    setModalOpen(false);
    setModalAutoArm(false);
  };

  const handleModalClose = () => {
    setModalOpen(false);
    setModalAutoArm(false);
  };

  const handleDelete = async (filename: string) => {
    if (!confirm("Delete this pattern? This cannot be undone.")) return;
    try {
      await api.deletePattern(filename);
      if (selectedFilename === filename) setSelectedFilename(null);
      if (compareFilename === filename) setCompareFilename(null);
      await refreshList();
    } catch (e) {
      setError(String(e));
    }
  };

  const handleToggleCompare = (filename: string) => {
    if (compareFilename === filename) setCompareFilename(null);
    else if (selectedFilename !== filename) setCompareFilename(filename);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so same file can re-import
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Pattern;
      if (typeof parsed.schema_version !== "number" || !Array.isArray(parsed.events)) {
        throw new Error("file does not look like a Recoil Trainer pattern");
      }
      const filename = await api.savePattern(parsed);
      await refreshList();
      setSelectedFilename(filename);
    } catch (err) {
      setError(`Import failed: ${err}`);
    }
  };

  const finishOnboarding = () => {
    markOnboarded();
    setOnboardingOpen(false);
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h1>Recoil Trainer</h1>
            <div className="row" style={{ gap: 4 }}>
              <button
                onClick={() => importInputRef.current?.click()}
                title="Import a pattern JSON"
                style={{ padding: "4px 8px", fontSize: 11 }}
              >
                ⇡
              </button>
              <button
                onClick={() => setSettingsOpen(true)}
                title="Settings"
                style={{ padding: "4px 8px", fontSize: 11 }}
              >
                ⚙
              </button>
            </div>
          </div>
          <input
            ref={importInputRef}
            type="file"
            accept=".json,application/json"
            onChange={handleImport}
            style={{ display: "none" }}
          />
          <button
            className="primary"
            onClick={() => {
              setModalAutoArm(false);
              setModalOpen(true);
            }}
          >
            + New Recording <span className="hotkey">F8</span>
          </button>
        </div>
        <div className="sidebar-list">
          <PatternList
            patterns={patterns}
            selected={selectedFilename}
            compareWith={compareFilename}
            onSelect={setSelectedFilename}
            onToggleCompare={handleToggleCompare}
            onDelete={handleDelete}
          />
        </div>
        <div className="sidebar-footer">
          <div>Patterns dir:</div>
          <div title={patternsDir}>{patternsDir || "…"}</div>
        </div>
      </aside>

      <main className="main">
        {error && (
          <div
            className="chart-panel"
            style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
          >
            {error}{" "}
            <button onClick={() => setError(null)} style={{ marginLeft: 8 }}>
              dismiss
            </button>
          </div>
        )}

        {selectedPattern ? (
          <PatternVisualizer
            pattern={selectedPattern}
            compareWith={comparePattern}
          />
        ) : (
          <EmptyState
            onRecord={() => {
              setModalAutoArm(false);
              setModalOpen(true);
            }}
            hasPatterns={patterns.length > 0}
          />
        )}
      </main>

      {modalOpen && (
        <RecordingModal
          onSaved={handleSaved}
          onClose={handleModalClose}
          autoArm={modalAutoArm}
        />
      )}

      {settingsOpen && (
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      )}

      {onboardingOpen && (
        <OnboardingModal onClose={finishOnboarding} />
      )}
    </div>
  );
}

function EmptyState({
  onRecord,
  hasPatterns,
}: {
  onRecord: () => void;
  hasPatterns: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        color: "var(--text-faint)",
        gap: 16,
      }}
    >
      <div style={{ fontSize: 48, opacity: 0.3 }}>◎</div>
      <div style={{ fontSize: 16 }}>
        {hasPatterns
          ? "Select a pattern from the sidebar"
          : "No recordings yet"}
      </div>
      <div style={{ fontSize: 13, color: "var(--text-dim)" }}>
        Press <kbd>F8</kbd> to quick-record with your last settings
      </div>
      <button className="primary" onClick={onRecord}>
        Start a new recording
      </button>
    </div>
  );
}
