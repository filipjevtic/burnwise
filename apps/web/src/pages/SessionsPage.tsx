import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Select } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Badge } from "../components/ui/badge.js";
import { Button } from "../components/ui/button.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { useSessions, useSessionDetail, type SessionListItem } from "../hooks/use-sessions.js";
import { Activity, X } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-sm text-muted-foreground">Agent work sessions and their AI usage, by developer and ticket.</p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="sprintFilter" className="text-sm font-medium whitespace-nowrap">Sprint</label>
          <Select id="sprintFilter" value={sprintFilter} onChange={(e) => setSprintFilter(e.target.value)} className="w-56">
            <option value="">All sprints</option>
            {sprints.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </Select>
        </div>
      </div>

      {error && <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">Error: {error}</div>}

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : sessions.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center">
          <Activity className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <h3 className="text-base font-medium">No sessions yet</h3>
          <p className="mt-1 max-w-sm mx-auto text-sm text-muted-foreground">
            Start a session with <code className="font-mono">ats start &lt;TICKET&gt;</code>, the proxy, or your IDE to see it here.
          </p>
        </div>
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
                    <TableCell>{s.ticket?.externalId || s.ticketKey || "—"}</TableCell>
                    <TableCell className="text-muted-foreground">{s.source}</TableCell>
                    <TableCell>
                      <Badge variant={s.status === "active" ? "default" : "secondary"}>{s.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">{s.tokens.toLocaleString()}</TableCell>
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

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-background shadow-lg">
        <div className="flex h-14 items-center justify-between border-b px-4">
          <span className="font-semibold">Session detail</span>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {loading && <Skeleton className="h-40" />}
          {error && <div className="rounded-md bg-destructive/15 p-4 text-sm text-destructive">Error: {error}</div>}
          {detail && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Developer" value={detail.session.user?.name || "Unknown"} />
                <Field label="Ticket" value={detail.session.ticket?.externalId || detail.session.ticketKey || "—"} />
                <Field label="Source" value={detail.session.source} />
                <Field label="Status" value={detail.session.status} />
                <Field label="Branch" value={detail.session.branch || "—"} />
                <Field label="Started" value={new Date(detail.session.startedAt).toLocaleString()} />
              </div>

              <div className="grid grid-cols-4 gap-2">
                <Stat label="Tokens" value={detail.summary.totalTokens.toLocaleString()} />
                <Stat label="Cost" value={`$${detail.summary.totalCost.toFixed(2)}`} />
                <Stat label="Time" value={formatDuration(detail.summary.totalDurationSeconds)} />
                <Stat label="Events" value={String(detail.summary.eventCount)} />
              </div>

              <div>
                <h4 className="mb-2 text-sm font-medium">Event timeline</h4>
                {detail.events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No events.</p>
                ) : (
                  <ul className="space-y-1">
                    {detail.events.map((e) => (
                      <li key={e.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-xs">
                        <span className="font-mono">{e.eventType}</span>
                        <span className="text-muted-foreground">{new Date(e.timestamp).toLocaleTimeString()}</span>
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

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border p-2 text-center">
      <div className="text-sm font-bold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}

export type { SessionListItem };
