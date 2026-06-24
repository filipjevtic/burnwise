import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Select } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { SprintSummary } from "../hooks/use-project-data.js";
import { useDevelopers } from "../hooks/use-developers.js";
import { useTrends, type TrendBucket } from "../hooks/use-trends.js";
import { TrendChart } from "../components/TrendChart.js";
import { Coins, Clock, Ticket, Activity, BarChart3, FolderKanban, Users, LineChart } from "lucide-react";

export function DashboardPage({
  projectId,
  sprints,
  selectedSprint,
  setSelectedSprint,
  summary,
  loading,
}: {
  projectId: string;
  sprints: Array<{ id: string; name: string }>;
  selectedSprint: string | null;
  setSelectedSprint: (id: string) => void;
  summary: SprintSummary | null;
  loading: boolean;
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Track sprint-level AI usage and cost.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sprint" className="text-sm font-medium whitespace-nowrap">
            Sprint
          </label>
          <Select
            id="sprint"
            value={selectedSprint || ""}
            onChange={(e) => setSelectedSprint(e.target.value)}
            className="w-56"
          >
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {loading && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      )}

      {summary && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <StatCard label="Tokens" value={summary.summary.totalTokens.toLocaleString()} icon={BarChart3} />
            <StatCard label="Cost (USD)" value={`$${summary.summary.totalCost.toFixed(4)}`} icon={Coins} />
            <StatCard label="Duration (h)" value={(summary.summary.totalDurationSeconds / 3600).toFixed(2)} icon={Clock} />
            <StatCard label="Tickets" value={summary.summary.ticketCount} icon={Ticket} />
            <StatCard label="Events" value={summary.summary.eventCount} icon={Activity} />
          </div>

          <UsageTrends projectId={projectId} sprintId={selectedSprint} />

          <Card>
            <CardHeader>
              <CardTitle>Tickets</CardTitle>
            </CardHeader>
            <CardContent>
              {summary.tickets.length === 0 ? (
                <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                  No tickets in this sprint. Sync an issue tracker to populate tickets.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ticket</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Events</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summary.tickets.map((t) => (
                      <TableRow key={t.ticketId}>
                        <TableCell>
                          <div className="font-medium">{t.externalId}</div>
                          <div className="text-sm text-muted-foreground">{t.title}</div>
                        </TableCell>
                        <TableCell className="text-right">{t.tokens.toLocaleString()}</TableCell>
                        <TableCell className="text-right">${t.cost.toFixed(4)}</TableCell>
                        <TableCell className="text-right">{t.events}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <DeveloperBreakdown projectId={projectId} sprintId={selectedSprint} />
        </>
      )}

      {!loading && !summary && (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <FolderKanban className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-base font-medium">No sprint data</h3>
          <p className="mt-1 max-w-xs mx-auto text-sm text-muted-foreground">
            Select a sprint or sync an issue tracker to see ticket-level usage.
          </p>
        </div>
      )}
    </div>
  );
}

function formatHours(seconds: number): string {
  return (seconds / 3600).toFixed(2);
}

type TrendMetric = "tokens" | "cost" | "duration";

function UsageTrends({ projectId, sprintId }: { projectId: string; sprintId: string | null }) {
  const [metric, setMetric] = useState<TrendMetric>("tokens");
  const [bucket, setBucket] = useState<TrendBucket>("day");
  const { points, loading, error } = useTrends(projectId, sprintId, bucket);

  const chartData = points.map((p) => ({
    period: p.period,
    value: metric === "tokens" ? p.tokens : metric === "cost" ? p.cost : p.durationSeconds / 3600,
  }));

  const format =
    metric === "tokens"
      ? (v: number) => v.toLocaleString()
      : metric === "cost"
        ? (v: number) => `$${v.toFixed(4)}`
        : (v: number) => `${v.toFixed(2)}h`;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <LineChart className="h-5 w-5 text-muted-foreground" />
          Usage trends
        </CardTitle>
        <div className="flex items-center gap-2">
          <Select value={metric} onChange={(e) => setMetric(e.target.value as TrendMetric)} aria-label="Metric" className="w-32">
            <option value="tokens">Tokens</option>
            <option value="cost">Cost</option>
            <option value="duration">Duration</option>
          </Select>
          <Select value={bucket} onChange={(e) => setBucket(e.target.value as TrendBucket)} aria-label="Bucket" className="w-28">
            <option value="day">Daily</option>
            <option value="week">Weekly</option>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">Error: {error}</div>
        ) : loading ? (
          <Skeleton className="h-40" />
        ) : (
          <TrendChart data={chartData} format={format} />
        )}
      </CardContent>
    </Card>
  );
}

function DeveloperBreakdown({ projectId, sprintId }: { projectId: string; sprintId: string | null }) {
  const { developers, loading, error } = useDevelopers(projectId, sprintId);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5 text-muted-foreground" />
          By developer
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">Error: {error}</div>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : developers.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No attributed usage yet. Developers appear here once they use a personal API key.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Developer</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Time (h)</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
                <TableHead className="text-right">Tickets</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {developers.map((d) => (
                <TableRow key={d.userId}>
                  <TableCell>
                    <div className="font-medium">{d.name}</div>
                    {d.email && <div className="text-sm text-muted-foreground">{d.email}</div>}
                  </TableCell>
                  <TableCell className="text-right">{d.tokens.toLocaleString()}</TableCell>
                  <TableCell className="text-right">${d.cost.toFixed(4)}</TableCell>
                  <TableCell className="text-right">{formatHours(d.durationSeconds)}</TableCell>
                  <TableCell className="text-right">{d.sessionCount}</TableCell>
                  <TableCell className="text-right">{d.ticketCount}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}
