import { Card, CardContent } from "../components/ui/card.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { PageHeader, EmptyState, ErrorNote } from "../components/ui/page.js";
import { useAudit } from "../hooks/use-audit.js";
import { useAuth } from "../context/auth.js";
import { ScrollText, ShieldAlert } from "lucide-react";

/** Compact one-line summary of an entry's metadata for the table. */
function summarizeMeta(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  return Object.entries(meta)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

export function AuditPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const { entries, total, loading, error } = useAudit(isAdmin);

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader title="Audit log" description="An immutable record of sensitive changes." />
        <EmptyState icon={ShieldAlert} title="Admins only">
          The audit log is visible to workspace admins.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit log"
        description="Immutable record of who changed what — ticket associations and team membership."
      />
      {loading ? (
        <Skeleton className="h-40" />
      ) : error ? (
        <ErrorNote>Error: {error}</ErrorNote>
      ) : entries.length === 0 ? (
        <EmptyState icon={ScrollText} title="No audit entries yet">
          Association changes (resolve/reject) and team changes are recorded here as they happen.
        </EmptyState>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <p className="mb-3 text-xs text-muted-foreground">{total} entries.</p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{e.action}</Badge>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{e.actorUserId ?? "system"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {e.targetType ? `${e.targetType}:${(e.targetId ?? "").slice(0, 8)}` : "—"}
                    </TableCell>
                    <TableCell className="max-w-md truncate text-sm text-muted-foreground">{summarizeMeta(e.metadata)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
