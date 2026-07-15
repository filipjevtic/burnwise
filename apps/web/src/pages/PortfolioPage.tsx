import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Badge } from "../components/ui/badge.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { PageHeader, StatGrid, Stat, EmptyState, ErrorNote } from "../components/ui/page.js";
import { usePortfolio, type PortfolioProject } from "../hooks/use-portfolio.js";
import { Layers } from "lucide-react";

function pct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function confidenceBadge(c: PortfolioProject["capacityConfidence"]) {
  if (c === "high") return <Badge variant="success">High</Badge>;
  if (c === "medium") return <Badge variant="info">Medium</Badge>;
  return <Badge variant="secondary">Low</Badge>;
}

export function PortfolioPage() {
  const { projects, totals, loading, error } = usePortfolio();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Portfolio"
        description="Velocity and AI-assisted effort across every project in the workspace — the leadership view."
      />

      {error && <ErrorNote>Error: {error}</ErrorNote>}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-[5.5rem] rounded-none" />)}
          </div>
          <Skeleton className="h-56" />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState icon={Layers} title="No projects yet">
          Create projects and sync sprints to see a cross-project rollup of velocity and AI effort here.
        </EmptyState>
      ) : (
        <>
          <StatGrid cols={4}>
            <Stat label="Projects" value={totals.projectCount} emphasis />
            <Stat label="Completed points" value={totals.completedPoints.toLocaleString()} emphasis />
            <Stat label="AI tokens" value={totals.tokens.toLocaleString()} emphasis />
            <Stat label="Tokens / point" value={totals.tokensPerPoint.toLocaleString()} hint="Workspace-wide efficiency" emphasis />
          </StatGrid>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                By project
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Sprints</TableHead>
                    <TableHead className="text-right">Avg completed</TableHead>
                    <TableHead className="text-right">Estimate accuracy</TableHead>
                    <TableHead className="text-right">Next capacity</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead className="text-right">Tokens</TableHead>
                    <TableHead className="text-right">Tokens / pt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projects.map((p) => (
                    <TableRow key={p.projectId}>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right">{p.sprintCount}</TableCell>
                      <TableCell className="text-right">{p.avgCompletedPoints.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{p.sprintCount > 0 ? pct(p.estimateAccuracy) : "—"}</TableCell>
                      <TableCell className="text-right">{p.recommendedPoints.toLocaleString()}</TableCell>
                      <TableCell>{confidenceBadge(p.capacityConfidence)}</TableCell>
                      <TableCell className="text-right">{p.tokens.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{p.completedPoints > 0 ? p.tokensPerPoint.toLocaleString() : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
