import { useMemo, useState } from "react";
import type { PatternSummary } from "../types";

export function PatternList({
  patterns,
  selected,
  compareWith,
  onSelect,
  onToggleCompare,
  onDelete,
}: {
  patterns: PatternSummary[];
  selected: string | null;
  compareWith: string | null;
  onSelect: (filename: string) => void;
  onToggleCompare: (filename: string) => void;
  onDelete: (filename: string) => void;
}) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patterns;
    return patterns.filter((p) => {
      const hay = `${p.name} ${p.game} ${p.weapon}`.toLowerCase();
      return hay.includes(q);
    });
  }, [patterns, query]);

  if (patterns.length === 0) {
    return (
      <div className="empty-state">
        No saved patterns yet.
        <br />
        Record one to get started.
      </div>
    );
  }

  return (
    <>
      {patterns.length > 4 && (
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter…"
          style={{ marginBottom: 8, fontSize: 12 }}
        />
      )}

      {filtered.length === 0 && (
        <div className="empty-state" style={{ padding: "16px 8px" }}>
          No matches for "{query}".
        </div>
      )}

      {filtered.map((p) => {
        const isSelected = selected === p.filename;
        const isComparing = compareWith === p.filename;
        const canCompare = !!selected && !isSelected;
        return (
          <div
            key={p.filename}
            className={`pattern-card ${isSelected ? "selected" : ""} ${isComparing ? "comparing" : ""}`}
            onClick={() => onSelect(p.filename)}
          >
            <div className="row">
              <div className="grow">
                <div className="name">{p.name}</div>
                <div className="meta">
                  <span>{p.game}</span>
                  <span>·</span>
                  <span>{p.weapon}</span>
                  <span>·</span>
                  <span>{p.event_count} events</span>
                </div>
              </div>
              {canCompare && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCompare(p.filename);
                  }}
                  style={{ padding: "2px 8px", fontSize: 11 }}
                  title={isComparing ? "Stop comparing" : "Compare with selected"}
                >
                  {isComparing ? "◐" : "◯"}
                </button>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(p.filename);
                }}
                style={{ padding: "2px 8px", fontSize: 11 }}
                title="Delete pattern"
              >
                ×
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}
