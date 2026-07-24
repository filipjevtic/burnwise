import { useEffect, useState } from "react";
import { Card, CardContent } from "../components/ui/card.js";
import { Button } from "../components/ui/button.js";
import { Select } from "../components/ui/select.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { PageHeader, EmptyState, ErrorNote } from "../components/ui/page.js";
import { useUnresolved } from "../hooks/use-unresolved.js";
import { useRejectionRules } from "../hooks/use-rejection-rules.js";
import { useAuth } from "../context/auth.js";
import { Input } from "../components/ui/input.js";
import { Inbox, X } from "lucide-react";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface TicketOption {
  id: string;
  externalId: string;
  title: string;
}

/** A short human hint about an event, to help decide which ticket it belongs to. */
function eventHint(payload: Record<string, unknown> | null, metadata: Record<string, unknown> | null): string {
  const p = payload ?? {};
  const m = metadata ?? {};
  const bits: string[] = [];
  if (typeof p.provider === "string") bits.push(p.provider);
  if (typeof p.model === "string") bits.push(p.model);
  const promptText = typeof p.promptText === "string" ? p.promptText : "";
  if (promptText) bits.push(`"${promptText.slice(0, 80)}${promptText.length > 80 ? "…" : ""}"`);
  const branch = typeof m.branch === "string" ? m.branch : "";
  if (branch) bits.push(`branch: ${branch}`);
  return bits.join(" · ") || "—";
}

export function UnresolvedPage({ projectId }: { projectId: string }) {
  const { token } = useAuth();
  const { events, total, loading, error, resolve, reject, refresh } = useUnresolved(projectId);
  const { rules, error: rulesError, addRule, deleteRule } = useRejectionRules(projectId);
  const [tickets, setTickets] = useState<TicketOption[]>([]);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [ruleField, setRuleField] = useState("source");
  const [ruleValue, setRuleValue] = useState("");

  useEffect(() => {
    if (!projectId || !token) return;
    fetch(`${API_URL}/api/v1/tickets/project/${projectId}?limit=500`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setTickets(data?.tickets ?? []))
      .catch(() => {});
  }, [projectId, token]);

  async function run(eventId: string, fn: () => Promise<void>) {
    setBusy(eventId);
    setActionError(null);
    try {
      await fn();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Unresolved events"
        description="Events the association pipeline couldn't tie to a ticket. Assign them manually, or reject ones that aren't project work."
      />

      {actionError && <ErrorNote>{actionError}</ErrorNote>}

      {loading ? (
        <Skeleton className="h-40" />
      ) : error ? (
        <ErrorNote>Error: {error}</ErrorNote>
      ) : events.length === 0 ? (
        <EmptyState icon={Inbox} title="Nothing to resolve">
          Every event is attributed to a ticket (or has been rejected). New unattributed events show up here.
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 text-xs text-muted-foreground">
              {total} unresolved event{total === 1 ? "" : "s"}.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Event</TableHead>
                  <TableHead>Hint</TableHead>
                  <TableHead>When</TableHead>
                  <TableHead className="w-[22rem]">Resolve</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {events.map((e) => (
                  <TableRow key={e.eventId}>
                    <TableCell className="font-medium">
                      {e.eventType}
                      <span className="ml-1 text-xs text-muted-foreground">{e.source}</span>
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">
                      {eventHint(e.payload, e.metadata)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(e.timestamp).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Select
                          value={choice[e.eventId] ?? ""}
                          disabled={busy === e.eventId}
                          onChange={(ev) => setChoice((c) => ({ ...c, [e.eventId]: ev.target.value }))}
                        >
                          <option value="">Select ticket…</option>
                          {tickets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.externalId} — {t.title}
                            </option>
                          ))}
                        </Select>
                        <Button
                          size="sm"
                          disabled={busy === e.eventId || !choice[e.eventId]}
                          onClick={() => run(e.eventId, () => resolve(e.eventId, choice[e.eventId]))}
                        >
                          Assign
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === e.eventId}
                          onClick={() => run(e.eventId, () => reject(e.eventId))}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="space-y-3 pt-6">
          <div>
            <h3 className="text-sm font-medium">Rejection rules</h3>
            <p className="text-xs text-muted-foreground">
              Auto-hide recurring noise (a bot user, a non-work source) from the queue. Rules filter the view; they don't delete events, so removing a rule brings them back.
            </p>
          </div>
          {rulesError && <ErrorNote>{rulesError}</ErrorNote>}
          {rules.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rules.map((r) => (
                <span key={r.id} className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs">
                  <span className="text-muted-foreground">{r.field}</span>
                  <span className="font-medium">{r.value}</span>
                  <button
                    aria-label={`Delete rule ${r.field}=${r.value}`}
                    className="ml-0.5 text-muted-foreground hover:text-foreground"
                    onClick={async () => {
                      await deleteRule(r.id);
                      refresh();
                    }}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Select value={ruleField} onChange={(e) => setRuleField(e.target.value)} className="w-32">
              <option value="source">source</option>
              <option value="userId">userId</option>
            </Select>
            <Input
              value={ruleValue}
              placeholder={ruleField === "source" ? "e.g. cli" : "user id"}
              onChange={(e) => setRuleValue(e.target.value)}
              className="max-w-xs"
            />
            <Button
              size="sm"
              disabled={!ruleValue.trim()}
              onClick={async () => {
                if (await addRule(ruleField, ruleValue.trim())) {
                  setRuleValue("");
                  refresh();
                }
              }}
            >
              Add rule
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
