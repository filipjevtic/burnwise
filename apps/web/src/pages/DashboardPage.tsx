import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Select } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Button } from "../components/ui/button.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { PageHeader, StatGrid, Stat, EmptyState, ErrorNote } from "../components/ui/page.js";
import { SprintSummary } from "../hooks/use-project-data.js";
import { useDevelopers } from "../hooks/use-developers.js";
import { useTrends, type TrendBucket } from "../hooks/use-trends.js";
import { useToolBreakdown, toolLabel } from "../hooks/use-tool-breakdown.js";
import { useAuth } from "../context/auth.js";
import { downloadCsv } from "../lib/download.js";
import { TrendChart } from "../components/TrendChart.js";
import { Coins, Clock, Ticket, Activity, BarChart3, FolderKanban, Users, LineChart, Download, Wrench } from "lucide-react";

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
      <PageHeader
        title="Dashboard"
        description="Sprint-level AI-assisted effort, attributed by ticket and developer."
        actions={
          <>
            <label htmlFor="sprint" className="text-sm font-medium text-muted-foreground whitespace-nowrap">
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
          </>
        }
      />

      {loading && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-none" />
          ))}
        </div>
      )}

      {summary && (
        <>
          <StatGrid cols={5}>
            <Stat label="Tokens" value={summary.summary.totalTokens.toLocaleString()} icon={BarChart3} emphasis />
            <Stat label="Cost" value={`$${summary.summary.totalCost.toFixed(2)}`} icon={Coins} emphasis />
            <Stat label="Duration" value={`${(summary.summary.totalDurationSeconds / 3600).toFixed(1)}h`} icon={Clock} emphasis />
            <Stat label="Tickets" value={summary.summary.ticketCount} icon={Ticket} emphasis />
            <Stat label="Events" value={summary.summary.eventCount} icon={Activity} emphasis />
          </StatGrid>

          <UsageTrends projectId={projectId} sprintId={selectedSprint} />

          <ToolBreakdown projectId={projectId} sprintId={selectedSprint} />

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-4 w-4 text-muted-foreground" />
                Tickets
              </CardTitle>
            </CardHeader>
            <CardContent>
              {summary.tickets.length === 0 ? (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No tickets in this sprint. Sync an issue tracker to populate tickets.
                </p>
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
                          <div className="font-mono text-xs font-medium text-foreground">{t.externalId}</div>
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
        <EmptyState icon={FolderKanban} title="No sprint data">
          Select a sprint or sync an issue tracker to see ticket-level usage.
        </EmptyState>
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
          <LineChart className="h-4 w-4 text-muted-foreground" />
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
          <ErrorNote>Error: {error}</ErrorNote>
        ) : loading ? (
          <Skeleton className="h-40" />
        ) : (
          <TrendChart data={chartData} format={format} />
        )}
      </CardContent>
    </Card>
  );
}

function ToolBreakdown({ projectId, sprintId }: { projectId: string; sprintId: string | null }) {
  const { tools, loading, error } = useToolBreakdown(projectId, sprintId);
  const totalTokens = tools.reduce((sum, t) => sum + t.tokens, 0);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-muted-foreground" />
          By tool
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorNote>Error: {error}</ErrorNote>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : tools.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No AI-tool usage yet. Connect Claude Code (MCP), the proxy (Cursor/Aider), or the CLI to see a per-tool breakdown.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tool</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Share</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Sessions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tools.map((t) => {
                const label = toolLabel(t.source);
                const share = totalTokens > 0 ? (t.tokens / totalTokens) * 100 : 0;
                return (
                  <TableRow key={t.source}>
                    <TableCell>
                      <div className="font-medium">{label.name}</div>
                      {label.hint && <div className="text-xs text-muted-foreground">{label.hint}</div>}
                    </TableCell>
                    <TableCell className="text-right">{t.tokens.toLocaleString()}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{share.toFixed(0)}%</TableCell>
                    <TableCell className="text-right">${t.cost.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{t.sessionCount}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function DeveloperBreakdown({ projectId, sprintId }: { projectId: string; sprintId: string | null }) {
  const { developers, loading, error } = useDevelopers(projectId, sprintId);
  const { token } = useAuth();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ projectId });
      if (sprintId) params.set("sprintId", sprintId);
      await downloadCsv(`/api/v1/analytics/export/developers?${params}`, "developers.csv", token);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          By developer
        </CardTitle>
        <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || developers.length === 0}>
          <Download className="h-4 w-4" />
          {exporting ? "Exporting…" : "Export CSV"}
        </Button>
      </CardHeader>
      <CardContent>
        {error ? (
          <ErrorNote>Error: {error}</ErrorNote>
        ) : loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
          </div>
        ) : developers.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No attributed usage yet. Developers appear here once they use a personal API key.
          </p>
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
