import { useState } from "react";

export interface TrendChartPoint {
  period: string;
  value: number;
}

/**
 * A minimal, dependency-free SVG bar chart. Renders evenly spaced bars scaled
 * to the max value, with a hover tooltip. Kept intentionally small so the web
 * bundle does not need a charting library. Colors reference the design tokens
 * directly (the tokens hold full oklch() values).
 */
export function TrendChart({
  data,
  height = 160,
  format = (v) => v.toLocaleString(),
  color = "var(--primary)",
}: {
  data: TrendChartPoint[];
  height?: number;
  format?: (value: number) => string;
  color?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-border text-sm text-muted-foreground">
        No data for this range.
      </div>
    );
  }

  const max = Math.max(...data.map((d) => d.value), 1);
  const barGap = 2;
  const width = 600;
  const barWidth = (width - barGap * (data.length - 1)) / data.length;
  const chartHeight = height - 24; // leave room for the baseline label
  const radius = Math.min(barWidth / 2, 3);

  return (
    <div className="relative w-full overflow-hidden">
      <svg viewBox={`0 0 ${width} ${height}`} className="chart-in w-full" preserveAspectRatio="none" role="img">
        {data.map((d, i) => {
          const barHeight = (d.value / max) * chartHeight;
          const x = i * (barWidth + barGap);
          const y = chartHeight - barHeight;
          return (
            <rect
              key={d.period}
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(barHeight, d.value > 0 ? 1 : 0)}
              rx={radius}
              fill={color}
              opacity={hover === null || hover === i ? 1 : 0.4}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{data[0].period}</span>
        {data.length > 1 && <span>{data[data.length - 1].period}</span>}
      </div>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-0 z-[var(--z-dropdown)] -translate-x-1/2 rounded-md border border-border bg-popover px-2 py-1 text-xs shadow-md">
          <span className="font-medium">{data[hover].period}</span>: <span className="tabular-nums">{format(data[hover].value)}</span>
        </div>
      )}
    </div>
  );
}
