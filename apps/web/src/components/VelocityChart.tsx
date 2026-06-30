import { useState } from "react";

export interface VelocityChartPoint {
  label: string;
  committed: number;
  completed: number;
  rollingAverage: number;
}

/**
 * Dependency-free SVG chart for sprint velocity: paired committed vs completed
 * story-point bars per sprint, with a rolling-average line overlaid so planners
 * can read the smoothed trend. Kept small so the web bundle needs no chart lib.
 */
export function VelocityChart({ data, height = 240 }: { data: VelocityChartPoint[]; height?: number }) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
        No sprints with story points yet.
      </div>
    );
  }

  const max = Math.max(...data.flatMap((d) => [d.committed, d.completed, d.rollingAverage]), 1);
  const width = 640;
  const chartHeight = height - 28; // room for the baseline labels
  const groupWidth = width / data.length;
  const barWidth = Math.min(28, (groupWidth - 12) / 2);

  const yFor = (v: number) => chartHeight - (v / max) * chartHeight;

  // Rolling-average polyline points, centered over each sprint group.
  const linePoints = data
    .map((d, i) => `${i * groupWidth + groupWidth / 2},${yFor(d.rollingAverage)}`)
    .join(" ");

  return (
    <div className="relative w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" role="img">
        {data.map((d, i) => {
          const cx = i * groupWidth + groupWidth / 2;
          const committedX = cx - barWidth - 1;
          const completedX = cx + 1;
          const active = hover === null || hover === i;
          return (
            <g
              key={d.label}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              {/* transparent hit area covering the whole group */}
              <rect x={i * groupWidth} y={0} width={groupWidth} height={chartHeight} fill="transparent" />
              <rect
                x={committedX}
                y={yFor(d.committed)}
                width={barWidth}
                height={chartHeight - yFor(d.committed)}
                fill="hsl(var(--muted-foreground))"
                opacity={active ? 0.45 : 0.2}
              />
              <rect
                x={completedX}
                y={yFor(d.completed)}
                width={barWidth}
                height={chartHeight - yFor(d.completed)}
                fill="hsl(var(--primary))"
                opacity={active ? 1 : 0.5}
              />
            </g>
          );
        })}

        {/* Rolling-average line */}
        {data.length > 1 && (
          <polyline points={linePoints} fill="none" stroke="hsl(var(--destructive))" strokeWidth={2} />
        )}
        {data.map((d, i) => (
          <circle
            key={`pt-${d.label}`}
            cx={i * groupWidth + groupWidth / 2}
            cy={yFor(d.rollingAverage)}
            r={3}
            fill="hsl(var(--destructive))"
          />
        ))}
      </svg>

      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
        {data.map((d) => (
          <span key={d.label} className="flex-1 truncate text-center">{d.label}</span>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <LegendSwatch className="bg-muted-foreground/40" label="Committed" />
        <LegendSwatch className="bg-primary" label="Completed" />
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-destructive" />
          Rolling avg
        </span>
      </div>

      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-md border bg-background px-3 py-2 text-xs shadow-sm">
          <div className="font-medium">{data[hover].label}</div>
          <div>Committed: {data[hover].committed}</div>
          <div>Completed: {data[hover].completed}</div>
          <div>Rolling avg: {data[hover].rollingAverage}</div>
        </div>
      )}
    </div>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded-sm ${className}`} />
      {label}
    </span>
  );
}
