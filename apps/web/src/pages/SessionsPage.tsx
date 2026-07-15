import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Select } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { PageHeader, EmptyState, ErrorNote } from "../components/ui/page.js";
import { useSessions, useSessionDetail, type SessionListItem, type SessionFeedback, type TraceSummary } from "../hooks/use-sessions.js";
import { useAuth } from "../context/auth.js";
import { downloadCsv } from "../lib/download.js";
import { Activity, X, Download, ExternalLink } from "lucide-react";
import { useWorkspace } from "../hooks/use-workspace.js";

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  return `${(seconds / 3600).toFixed(1)}h`;
}

export function SessionsPage({
  projectId,
  sprints,
}: {
  projectId: string;
  sprints: Array<{ id: string; name: string }>;
}) {
  const [sprintFilter, setSprintFilter] = useState<string>("");
  const { sessions, loading, error } = useSessions(projectId, sprintFilter || null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { token } = useAuth();
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    setExporting(true);
    try {
      const params = new URLSearchParams({ projectId });
      if (sprintFilter) params.set("sprintId", sprintFilter);
      await downloadCsv(`/api/v1/analytics/export/sessions?${params}`, "sessions.csv", token);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sessions"
        description="Agent work sessions and their AI usage, by developer and ticket."
        actions={
          <>
            <label htmlFor="sprintFilter" className="text-sm font-medium text-muted-foreground whitespace-nowrap">Sprint</label>
            <Select id="sprintFilter" value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="w-56">
              <option value="">All sprints</option>
              {sprints.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
            <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || sessions.length === 0}>
              <Download className="h-4 w-4" />
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          </>
        }
      />

      {error && <ErrorNote>Error: {error}</ErrorNote>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState icon={Activity} title="No sessions yet">
          Start a session with <code className="font-mono text-foreground">ats start &lt;TICKET&gt;</code>, the proxy, or your IDE to see it here.
        </EmptyState>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Recent sessions</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Developer</TableHead>
                  <TableHead>Ticket</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                  <TableHead className="text-right">Events</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setOpenId(s.id)}>
                    <TableCell className="font-medium">{s.user?.name || "Unknown"}</TableCell>
                    <TableCell className="font-mono text-xs">{s.ticket?.externalId || s.ticketKey || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.source}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "active" ? "success" : "secondary"}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      {s.tokenAnomaly && (
                        <Badge variant="destructive" className="mr-2" title="Unusually high token usage">
                          high
                        </Badge>
                      )}
                      {s.tokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">${s.cost.toFixed(4)}</TableCell>
                    <TableCell className="text-right">{formatDuration(s.durationSeconds)}</TableCell>
                    <TableCell className="text-right">{s.eventCount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {openId && <SessionDrawer sessionId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function SessionDrawer({ sessionId, onClose }: { sessionId: string; onClose: () => void }) {
  const { detail, loading, error } = useSessionDetail(sessionId);
  const { workspace } = useWorkspace();

  return (
    <div className="fixed inset-0 z-[var(--z-overlay)]">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto border-l border-border bg-card shadow-lg">
        <div className="sticky top-0 flex h-14 items-center justify-between border-b border-border bg-card px-4">
          <span className="font-semibold">Session detail</span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="space-y-5 p-4">
          {loading && <Skeleton className="h-40" />}
          {error && <ErrorNote>Error: {error}</ErrorNote>}
          {detail && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Developer" value={detail.session.user?.name || "Unknown"} />
                <Field label="Ticket" value={detail.session.ticket?.externalId || detail.session.ticketKey || "—"} mono />
                <Field label="Source" value={detail.session.source} />
                <Field label="Status" value={detail.session.status} />
                <Field label="Branch" value={detail.session.branch || "—"} mono />
                <Field label="Started" value={new Date(detail.session.startedAt).toLocaleString()} />
              </div>

              <div className="grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-border bg-border">
                <Stat label="Tokens" value={detail.summary.totalTokens.toLocaleString()} />
                <Stat label="Cost" value={`$${detail.summary.totalCost.toFixed(2)}`} />
                <Stat label="Time" value={formatDuration(detail.summary.totalDurationSeconds)} />
                <Stat label="Events" value={String(detail.summary.eventCount)} />
              </div>

              {detail.session.feedback && <FeedbackBlock feedback={detail.session.feedback} />}

              {detail.trace.spanCount > 0 && (
                <TraceBlock trace={detail.trace} viewerTemplate={workspace?.traceViewerUrlTemplate ?? null} />
              )}

              <div>
                <h4 className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">Event timeline</h4>
                {detail.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events.</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.events.map((e) => (
                      <li key={e.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs">
                        <span className="font-mono">{e.eventType}</span>
                        <span className="text-muted-foreground tabular-nums">{new Date(e.timestamp).toLocaleTimeString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TraceBlock({ trace, viewerTemplate }: { trace: TraceSummary; viewerTemplate: string | null }) {
  const fmt = (ms: number | null) => (ms === null ? "—" : ms >= 1000 ? `${(ms / 1000).toFixed(2)}s` : `${ms}ms`);
  const viewerLink = (traceId: string | null) =>
    viewerTemplate && traceId ? viewerTemplate.replace("{traceId}", encodeURIComponent(traceId)) : null;
  // A single "view trace" link when all spans share one trace id.
  const headerLink = trace.traceCount === 1 ? viewerLink(trace.spans.find((s) => s.traceId)?.traceId ?? null) : null;

  return (
    <div className="rounded-lg border border-border bg-accent/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="flex items-center gap-2 text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
          Trace
          {headerLink && (
            <a href={headerLink} target="_blank" rel="noopener noreferrer" className="text-accent-foreground hover:underline" title="Open in trace viewer">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </h4>
        <span className="text-xs text-muted-foreground tabular-nums">
          {trace.spanCount} span{trace.spanCount === 1 ? "" : "s"}
          {trace.errorCount > 0 && <span className="text-warning"> · {trace.errorCount} error{trace.errorCount === 1 ? "" : "s"}</span>}
          {" · "}{fmt(trace.totalSpanMs)}
        </span>
      </div>
      <ul className="space-y-1">
        {trace.spans.map((s, i) => {
          const link = viewerLink(s.traceId);
          return (
            <li key={i} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-1.5 text-xs">
              <span className="flex items-center gap-2 truncate">
                {s.status === "error" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" />}
                {link ? (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="truncate font-mono hover:underline">
                    {s.name}
                  </a>
                ) : (
                  <span className="truncate font-mono">{s.name}</span>
                )}
              </span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{fmt(s.durationMs)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FeedbackBlock({ feedback }: { feedback: SessionFeedback }) {
  return (
    <div className="rounded-lg border border-border bg-accent/30 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">Agent feedback</h4>
        {typeof feedback.effectiveness === "number" && (
          <span className="font-mono text-xs tabular-nums text-foreground">{feedback.effectiveness}/5 effectiveness</span>
        )}
      </div>
      {feedback.summary && <p className="mb-2 text-sm">{feedback.summary}</p>}
      {feedback.wins && feedback.wins.length > 0 && (
        <div className="mb-1.5">
          <div className="text-[0.625rem] uppercase tracking-wide text-success">Wins</div>
          <ul className="ml-4 list-disc text-sm text-muted-foreground">
            {feedback.wins.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}
      {feedback.blockers && feedback.blockers.length > 0 && (
        <div>
          <div className="text-[0.625rem] uppercase tracking-wide text-warning">Blockers</div>
          <ul className="ml-4 list-disc text-sm text-muted-foreground">
            {feedback.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={"font-medium " + (mono ? "font-mono text-sm" : "")}>{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-2.5 text-center">
      <div className="font-mono text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[0.625rem] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export type { SessionListItem };
