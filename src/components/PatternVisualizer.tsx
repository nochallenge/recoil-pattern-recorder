import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import type { Pattern } from "../types";

interface Derived {
  pathData: { x: number; y: number; t: number }[];
  dxData: { t: number; dx: number }[];
  dyData: { t: number; dy: number }[];
  stats: {
    count: number;
    durationMs: number;
    peakDx: number;
    peakDy: number;
    totalDx: number;
    totalDy: number;
    travelCm: number;
  };
}

/** Convert mouse counts to centimeters of physical mouse travel.
 *  Universal across games — depends only on DPI. */
function countsToCm(counts: number, dpi: number): number {
  return (counts / dpi) * 2.54;
}

function derive(p: Pattern): Derived {
  let cx = 0;
  let cy = 0;
  let peakDx = 0;
  let peakDy = 0;
  let travelCounts = 0; // path-length sum of per-event vector magnitudes
  const path: { x: number; y: number; t: number }[] = [];
  const dx: { t: number; dx: number }[] = [];
  const dy: { t: number; dy: number }[] = [];

  for (const ev of p.events) {
    cx += ev.dx;
    cy += ev.dy;
    travelCounts += Math.hypot(ev.dx, ev.dy);
    path.push({ x: cx, y: cy, t: ev.t_ms });
    dx.push({ t: ev.t_ms, dx: ev.dx });
    dy.push({ t: ev.t_ms, dy: ev.dy });
    if (Math.abs(ev.dx) > Math.abs(peakDx)) peakDx = ev.dx;
    if (Math.abs(ev.dy) > Math.abs(peakDy)) peakDy = ev.dy;
  }

  return {
    pathData: path,
    dxData: dx,
    dyData: dy,
    stats: {
      count: p.events.length,
      durationMs: p.events.at(-1)?.t_ms ?? 0,
      peakDx,
      peakDy,
      totalDx: cx,
      totalDy: cy,
      travelCm: countsToCm(travelCounts, p.reference_dpi),
    },
  };
}

export function PatternVisualizer({
  pattern,
  compareWith = null,
  compact = false,
}: {
  pattern: Pattern;
  compareWith?: Pattern | null;
  compact?: boolean;
}) {
  const primary = useMemo(() => derive(pattern), [pattern]);
  const compare = useMemo(
    () => (compareWith ? derive(compareWith) : null),
    [compareWith]
  );

  const isEmpty = pattern.events.length === 0;

  return (
    <div>
      {!compact && (
        <div className="main-header">
          <div>
            <h2>{pattern.name}</h2>
            <div className="subtitle">
              {pattern.game} · {pattern.weapon} · recorded{" "}
              {new Date(pattern.created_at).toLocaleString()}
              {compareWith && (
                <>
                  {" · comparing with "}
                  <span style={{ color: "var(--warn)" }}>
                    {compareWith.name}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="stat-row">
        <Stat label="Events" value={primary.stats.count} compare={compare?.stats.count} />
        <Stat
          label="Duration"
          value={`${(primary.stats.durationMs / 1000).toFixed(2)}s`}
          compare={compare ? `${(compare.stats.durationMs / 1000).toFixed(2)}s` : undefined}
        />
        <Stat
          label="Mouse travel"
          value={`${primary.stats.travelCm.toFixed(1)} cm`}
          compare={compare ? `${compare.stats.travelCm.toFixed(1)} cm` : undefined}
        />
        <Stat label="Total Δx" value={primary.stats.totalDx} compare={compare?.stats.totalDx} />
        <Stat label="Total Δy" value={primary.stats.totalDy} compare={compare?.stats.totalDy} />
        <Stat label="Peak Δy" value={primary.stats.peakDy} compare={compare?.stats.peakDy} />
      </div>

      {isEmpty ? (
        <div className="chart-panel">
          <div className="empty-state">
            No movement captured. Try a longer hold or a faster sample rate.
          </div>
        </div>
      ) : (
        <>
          <div className="chart-panel">
            <h3>Crosshair path (cumulative)</h3>
            <ResponsiveContainer width="100%" height={compact ? 240 : 320}>
              <ScatterChart margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="dx"
                  stroke="var(--text-dim)"
                  label={{
                    value: "cumulative Δx (counts)",
                    position: "insideBottom",
                    offset: -2,
                    fill: "var(--text-dim)",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="dy"
                  reversed
                  stroke="var(--text-dim)"
                  label={{
                    value: "Δy",
                    angle: -90,
                    position: "insideLeft",
                    fill: "var(--text-dim)",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  cursor={{ strokeDasharray: "3 3" }}
                  formatter={(v) => (typeof v === "number" ? v.toFixed(0) : String(v ?? ""))}
                  labelFormatter={() => ""}
                />
                <ReferenceLine x={0} stroke="var(--text-faint)" />
                <ReferenceLine y={0} stroke="var(--text-faint)" />
                <ZAxis type="number" range={[12, 12]} />
                <Scatter
                  name={pattern.name}
                  data={primary.pathData}
                  line={{ stroke: "var(--accent)", strokeWidth: 1.5 }}
                  lineType="joint"
                  shape="circle"
                  fill="var(--accent)"
                  isAnimationActive={false}
                />
                {compare && compareWith && (
                  <Scatter
                    name={compareWith.name}
                    data={compare.pathData}
                    line={{ stroke: "var(--warn)", strokeWidth: 1.5, strokeDasharray: "4 3" }}
                    lineType="joint"
                    shape="circle"
                    fill="var(--warn)"
                    isAnimationActive={false}
                  />
                )}
                {compare && <Legend wrapperStyle={{ fontSize: 11 }} />}
              </ScatterChart>
            </ResponsiveContainer>
          </div>

          {!compact && (
            <>
              <div className="chart-panel">
                <h3>Δx over time</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="t"
                      domain={[0, "dataMax"]}
                      stroke="var(--text-dim)"
                      tickFormatter={(t) => `${(t / 1000).toFixed(1)}s`}
                    />
                    <YAxis stroke="var(--text-dim)" />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(t) => `${t} ms`}
                    />
                    <ReferenceLine y={0} stroke="var(--text-faint)" />
                    <Line
                      type="monotone"
                      data={primary.dxData}
                      dataKey="dx"
                      name={pattern.name}
                      stroke="var(--accent)"
                      strokeWidth={1.2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {compare && compareWith && (
                      <Line
                        type="monotone"
                        data={compare.dxData}
                        dataKey="dx"
                        name={compareWith.name}
                        stroke="var(--warn)"
                        strokeWidth={1.2}
                        strokeDasharray="4 3"
                        dot={false}
                        isAnimationActive={false}
                      />
                    )}
                    {compare && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="chart-panel">
                <h3>Δy over time</h3>
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                    <XAxis
                      type="number"
                      dataKey="t"
                      domain={[0, "dataMax"]}
                      stroke="var(--text-dim)"
                      tickFormatter={(t) => `${(t / 1000).toFixed(1)}s`}
                    />
                    <YAxis stroke="var(--text-dim)" reversed />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(t) => `${t} ms`}
                    />
                    <ReferenceLine y={0} stroke="var(--text-faint)" />
                    <Line
                      type="monotone"
                      data={primary.dyData}
                      dataKey="dy"
                      name={pattern.name}
                      stroke="var(--accent)"
                      strokeWidth={1.2}
                      dot={false}
                      isAnimationActive={false}
                    />
                    {compare && compareWith && (
                      <Line
                        type="monotone"
                        data={compare.dyData}
                        dataKey="dy"
                        name={compareWith.name}
                        stroke="var(--warn)"
                        strokeWidth={1.2}
                        strokeDasharray="4 3"
                        dot={false}
                        isAnimationActive={false}
                      />
                    )}
                    {compare && <Legend wrapperStyle={{ fontSize: 11 }} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  compare,
}: {
  label: string;
  value: string | number;
  compare?: string | number;
}) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {compare !== undefined && (
        <div className="value-compare">{compare}</div>
      )}
    </div>
  );
}

const tooltipStyle = {
  background: "var(--bg-elev)",
  border: "1px solid var(--border)",
  borderRadius: 4,
  fontSize: 12,
} as const;
