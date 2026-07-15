import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Badge } from "../components/ui/badge.js";
import { Select } from "../components/ui/select.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { PageHeader, StatGrid, Stat, EmptyState, ErrorNote } from "../components/ui/page.js";
import { VelocityChart } from "../components/VelocityChart.js";
import { TrendChart } from "../components/TrendChart.js";
import { useVelocity } from "../hooks/use-velocity.js";
import { useEfficiency, type SprintEfficiency } from "../hooks/use-efficiency.js";
import { useCalibration, type Consistency } from "../hooks/use-calibration.js";
import { Gauge, Scale, AlertTriangle } from "lucide-react";

function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

/**
 * Variance flag for a sprint's estimate accuracy. Leads with the sprint-planning
 * narrative: did the team complete what it committed to?
 */
function completionBadge(rate: number, committed: number) {
  if (committed === 0) return <Badge variant="secondary">No commitment</Badge>;
  if (rate >= 0.9) return <Badge variant="success">On target</Badge>;
  if (rate >= 0.7) return <Badge variant="warning">Slight miss</Badge>;
  return <Badge variant="destructive">Under-delivered</Badge>;
}

type EfficiencyMetric = "cost" | "tokens" | "time";

const EFFICIENCY_METRICS: Record<
  EfficiencyMetric,
  { label: string; select: (s: SprintEfficiency) => number; format: (v: number) => string; average: (e: { averageCostPerPoint: number; averageTokensPerPoint: number; averageDurationSecondsPerPoint: number }) => number }
> = {
  cost: {
    label: "Cost / point",
    select: (s) => s.costPerPoint,
    format: (v) => `$${v.toFixed(2)}`,
    average: (e) => e.averageCostPerPoint,
  },
  tokens: {
    label: "Tokens / point",
    select: (s) => s.tokensPerPoint,
    format: (v) => v.toLocaleString(),
    average: (e) => e.averageTokensPerPoint,
  },
  time: {
    label: "Minutes / point",
    select: (s) => s.durationSecondsPerPoint / 60,
    format: (v) => `${v.toFixed(1)}m`,
    average: (e) => e.averageDurationSecondsPerPoint / 60,
  },
};

export function VelocityPage({ projectId }: { projectId: string }) {
  const { data, loading, error } = useVelocity(projectId, 3);
  const { data: efficiency, loading: efficiencyLoading } = useEfficiency(projectId);
  const [metric, setMetric] = useState<EfficiencyMetric>("cost");

  const chartData = data.sprints.map((s) => ({
    label: s.name,
    committed: s.committedPoints,
    completed: s.completedPoints,
    rollingAverage: s.rollingAveragePoints,
  }));

  const metricCfg = EFFICIENCY_METRICS[metric];
  const efficiencyPoints = efficiency.sprints
    .filter((s) => s.completedPoints > 0)
    .map((s) => ({ period: s.name, value: metricCfg.select(s) }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Velocity"
        description="Committed vs completed story points per sprint, with a rolling average to calibrate realistic capacity."
      />

      {error && <ErrorNote>Error: {error}</ErrorNote>}

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : data.sprints.length === 0 ? (
        <EmptyState icon={Gauge} title="No velocity data yet">
          Sync sprints with story points from your issue tracker to start measuring velocity.
        </EmptyState>
      ) : (
        <>
          <StatGrid cols={3}>
            <Stat label="Avg completed / sprint" value={data.averageCompletedPoints.toLocaleString()} hint="Mean completed story points" emphasis />
            <Stat label="Estimate accuracy" value={pct(data.averageCompletionRate)} hint="Avg completed ÷ committed" emphasis />
            <Stat label="Rolling average" value={data.latestRollingAveragePoints.toLocaleString()} hint="Trailing 3-sprint completed points" emphasis />
          </StatGrid>

          <Card>
            <CardHeader>
              <CardTitle>Committed vs completed</CardTitle>
              <CardDescription>Each sprint: committed (light) vs completed (solid) points, with the rolling-average line.</CardDescription>
            </CardHeader>
            <CardContent>
              <VelocityChart data={chartData} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Per-sprint breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sprint</TableHead>
                    <TableHead className="text-right">Committed</TableHead>
                    <TableHead className="text-right">Completed</TableHead>
                    <TableHead className="text-right">Completion</TableHead>
                    <TableHead className="text-right">Rolling avg</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.sprints.map((s) => (
                    <TableRow key={s.sprintId}>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right">
                        {s.committedPoints} <span className="text-muted-foreground">({s.committedTickets})</span>
                      </TableCell>
                      <TableCell className="text-right">
                        {s.completedPoints} <span className="text-muted-foreground">({s.completedTickets})</span>
                      </TableCell>
                      <TableCell className="text-right">{pct(s.completionRate)}</TableCell>
                      <TableCell className="text-right">{s.rollingAveragePoints}</TableCell>
                      <TableCell>{completionBadge(s.completionRate, s.committedPoints)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-1.5">
                <CardTitle>Efficiency per point</CardTitle>
                <CardDescription>AI effort to deliver one completed story point, by sprint. Lower trending = more efficient.</CardDescription>
              </div>
              <Select value={metric} onChange={(e) => setMetric(e.target.value as EfficiencyMetric)} className="w-44">
                <option value="cost">Cost / point</option>
                <option value="tokens">Tokens / point</option>
                <option value="time">Minutes / point</option>
              </Select>
            </CardHeader>
            <CardContent className="space-y-3">
              {efficiencyLoading ? (
                <Skeleton className="h-40" />
              ) : (
                <>
                  <div className="text-sm text-muted-foreground">
                    Average: <span className="font-mono font-medium tabular-nums text-foreground">{metricCfg.format(metricCfg.average(efficiency))}</span> per point
                  </div>
                  <TrendChart data={efficiencyPoints} format={metricCfg.format} />
                </>
              )}
            </CardContent>
          </Card>

          <CalibrationCard projectId={projectId} />
        </>
      )}
    </div>
  );
}

function consistencyBadge(c: Consistency) {
  if (c === "consistent") return <Badge variant="success">Consistent</Badge>;
  if (c === "noisy") return <Badge variant="warning">Noisy</Badge>;
  return <Badge variant="secondary">Moderate</Badge>;
}

function CalibrationCard({ projectId }: { projectId: string }) {
  const { data, loading, error } = useCalibration(projectId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Scale className="h-4 w-4 text-muted-foreground" />
          Estimate calibration
        </CardTitle>
        <CardDescription>
          Actual AI-assisted effort by story-point value across completed tickets — recalibrate estimates where effort doesn&apos;t track points.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <ErrorNote>Error: {error}</ErrorNote>
        ) : loading ? (
          <Skeleton className="h-40" />
        ) : data.buckets.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No completed, story-pointed tickets yet. Once tickets with story points are done, their real AI effort is calibrated here.
          </p>
        ) : (
          <>
            {data.inversions.map((inv, i) => (
              <div key={i} className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="font-medium tabular-nums">{inv.lowerPoints}-point</span> tickets averaged{" "}
                  <span className="font-mono tabular-nums">{inv.lowerAvgTokens.toLocaleString()}</span> tokens — more than{" "}
                  <span className="font-medium tabular-nums">{inv.higherPoints}-point</span> tickets (
                  <span className="font-mono tabular-nums">{inv.higherAvgTokens.toLocaleString()}</span>). These point values may not be distinguishing effort.
                </span>
              </div>
            ))}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Points</TableHead>
                  <TableHead className="text-right">Tickets</TableHead>
                  <TableHead className="text-right">Avg tokens</TableHead>
                  <TableHead className="text-right">Median</TableHead>
                  <TableHead className="text-right">Avg cost</TableHead>
                  <TableHead>Consistency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.buckets.map((b) => (
                  <TableRow key={b.storyPoints}>
                    <TableCell className="font-medium">{b.storyPoints}</TableCell>
                    <TableCell className="text-right">{b.ticketCount}</TableCell>
                    <TableCell className="text-right">{b.avgTokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{b.medianTokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right">${b.avgCost.toFixed(4)}</TableCell>
                    <TableCell>{consistencyBadge(b.consistency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </>
        )}
      </CardContent>
    </Card>
  );
}
