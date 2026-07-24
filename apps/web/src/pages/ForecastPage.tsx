import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card.js";
import { Input } from "../components/ui/input.js";
import { Label } from "../components/ui/label.js";
import { Badge } from "../components/ui/badge.js";
import { Skeleton } from "../components/ui/skeleton.js";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table.js";
import { PageHeader, StatGrid, Stat, EmptyState } from "../components/ui/page.js";
import { Forecast } from "../hooks/use-project-data.js";
import { useCISummary } from "../hooks/use-ci-summary.js";
import { useVelocity } from "../hooks/use-velocity.js";
import { useSprintCommit } from "../hooks/use-sprint-commit.js";
import { TrendingUp, Wallet, Timer, Target, Activity, Cpu, Users, Gauge, ListChecks } from "lucide-react";

export function ForecastPage({
  projectId,
  forecast,
  forecastTarget,
  setForecastTarget,
  loading,
}: {
  projectId: string;
  forecast: Forecast | null;
  forecastTarget: string;
  setForecastTarget: (value: string) => void;
  loading: boolean;
}) {
  const { summary: ciSummary, loading: ciLoading } = useCISummary(projectId);
  const { data: velocity, loading: velocityLoading } = useVelocity(projectId, 3);
  const { data: commit, loading: commitLoading } = useSprintCommit(projectId, 3);
  const capacity = velocity.capacity;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Forecast & Capacity"
        description="Plan the next sprint from historical velocity and AI-effort baselines."
      />

      {loading && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[5.5rem] rounded-none" />
          ))}
        </div>
      )}

      {forecast && (
        <>
          <section className="space-y-3">
            <h2 className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">Historical baseline</h2>
            <StatGrid cols={5}>
              <Stat label="Completed tickets" value={forecast.historical.completedTickets} icon={Target} />
              <Stat label="Total story points" value={forecast.historical.totalStoryPoints} icon={TrendingUp} />
              <Stat label="Tokens / SP" value={forecast.historical.tokensPerStoryPoint.toFixed(0)} icon={Activity} />
              <Stat label="Cost / SP" value={`$${forecast.historical.costPerStoryPoint.toFixed(4)}`} icon={Wallet} />
              <Stat label="Duration / SP" value={`${(forecast.historical.durationSecondsPerStoryPoint / 3600).toFixed(2)}h`} icon={Timer} />
            </StatGrid>
          </section>

          {forecast.developers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  Team capacity (completed work)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Developer</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Cost</TableHead>
                      <TableHead className="text-right">Time (h)</TableHead>
                      <TableHead className="text-right">Tickets</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {forecast.developers.map((d) => (
                      <TableRow key={d.userId}>
                        <TableCell className="font-medium">{d.name || d.userId}</TableCell>
                        <TableCell className="text-right">{d.tokens.toLocaleString()}</TableCell>
                        <TableCell className="text-right">${d.cost.toFixed(4)}</TableCell>
                        <TableCell className="text-right">{(d.durationSeconds / 3600).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{d.ticketCount}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                Velocity-based capacity
              </CardTitle>
            </CardHeader>
            <CardContent>
              {velocityLoading ? (
                <Skeleton className="h-24" />
              ) : capacity.sampleSize === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No completed sprints yet. Capacity is recommended from completed story points across past sprints.
                </p>
              ) : (
                <div className="space-y-4">
                  <StatGrid cols={4}>
                    <Stat label="Recommended points" value={capacity.recommendedPoints} icon={Target} emphasis />
                    <Stat label="Planning range" value={`${capacity.low}–${capacity.high}`} icon={TrendingUp} />
                    <Stat label="Avg / median" value={`${capacity.mean} / ${capacity.median}`} icon={Activity} />
                    <Stat label="Confidence" value={<Badge variant={confidenceVariant(capacity.confidence)}>{capacity.confidence}</Badge>} icon={Gauge} />
                  </StatGrid>
                  <p className="text-xs text-muted-foreground">
                    Based on {capacity.sampleSize} sprint{capacity.sampleSize === 1 ? "" : "s"} of completed story points (high outliers excluded). Use the median as a realistic commit target.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="h-4 w-4 text-muted-foreground" />
                Sprint-commit recommendation
              </CardTitle>
            </CardHeader>
            <CardContent>
              {commitLoading ? (
                <Skeleton className="h-24" />
              ) : commit.targetPoints === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No capacity yet — a recommendation needs completed sprints to estimate from.
                </p>
              ) : commit.selected.length === 0 && commit.deferred.length === 0 ? (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No backlog tickets to plan. Estimated tickets not yet assigned to a sprint appear here.
                </p>
              ) : (
                <div className="space-y-4">
                  <StatGrid cols={3}>
                    <Stat label="Committing" value={`${commit.committedPoints} / ${commit.targetPoints} pts`} icon={Target} emphasis />
                    <Stat label="Planning range" value={`${commit.low}–${commit.high} pts`} icon={TrendingUp} />
                    <Stat label="Confidence" value={<Badge variant={confidenceVariant(commit.confidence)}>{commit.confidence}</Badge>} icon={Gauge} />
                  </StatGrid>
                  <p className="text-xs text-muted-foreground">
                    Fills the capacity target with backlog tickets (oldest first). Commit these{" "}
                    <span className="font-medium text-foreground">{commit.selected.length}</span> ticket{commit.selected.length === 1 ? "" : "s"} for ~{commit.committedPoints} points.
                  </p>
                  {commit.selected.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Ticket</TableHead>
                          <TableHead>Title</TableHead>
                          <TableHead className="text-right">Points</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {commit.selected.map((t) => (
                          <TableRow key={t.id}>
                            <TableCell className="font-medium">{t.externalId || t.id.slice(0, 8)}</TableCell>
                            <TableCell className="text-muted-foreground">{t.title || "—"}</TableCell>
                            <TableCell className="text-right">{t.storyPoints}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {commit.deferred.length > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Deferred: {commit.deferred.filter((t) => t.reason === "over-capacity").length} over capacity
                      {commit.deferred.some((t) => t.reason === "unestimated")
                        ? `, ${commit.deferred.filter((t) => t.reason === "unestimated").length} unestimated (estimate to plan)`
                        : ""}
                      .
                    </p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Plan next sprint</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid w-full max-w-xs items-center gap-1.5">
                <Label htmlFor="forecastTarget">Target story points</Label>
                <Input
                  id="forecastTarget"
                  type="number"
                  value={forecastTarget}
                  onChange={(e) => setForecastTarget(e.target.value)}
                />
              </div>

              <StatGrid cols={4}>
                <Stat label="Recommended tokens" value={forecast.recommendation.recommendedTokenBudget?.toLocaleString() || "—"} icon={Activity} emphasis />
                <Stat label="Recommended cost" value={`$${forecast.recommendation.recommendedCostBudget?.toFixed(4) || "—"}`} icon={Wallet} emphasis />
                <Stat
                  label="Recommended duration"
                  value={forecast.recommendation.recommendedDurationSeconds ? `${(forecast.recommendation.recommendedDurationSeconds / 3600).toFixed(2)}h` : "—"}
                  icon={Timer}
                  emphasis
                />
                <Stat label="Confidence" value={<Badge variant={confidenceVariant(forecast.recommendation.confidence)}>{forecast.recommendation.confidence}</Badge>} icon={TrendingUp} />
              </StatGrid>
            </CardContent>
          </Card>

          {forecast.budget && (
            <Card>
              <CardHeader>
                <CardTitle>Budget status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-6 md:grid-cols-2">
                  <BudgetMeter
                    label="Token usage"
                    used={forecast.budget.tokenUsagePercent || 0}
                    budget={forecast.budget.tokenBudget || 0}
                    unit="tokens"
                  />
                  <BudgetMeter
                    label="Cost usage"
                    used={forecast.budget.costUsagePercent || 0}
                    budget={forecast.budget.costBudget || 0}
                    unit="USD"
                    prefix="$"
                  />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>CI/CD cost</CardTitle>
            </CardHeader>
            <CardContent>
              {ciLoading ? (
                <Skeleton className="h-12" />
              ) : ciSummary ? (
                <StatGrid cols={4}>
                  <Stat label="CI runs" value={ciSummary.runCount} icon={Cpu} />
                  <Stat label="CI cost" value={`$${ciSummary.totalCost.toFixed(4)}`} icon={Wallet} />
                  <Stat label="CI duration" value={`${(ciSummary.totalDurationSeconds / 3600).toFixed(2)}h`} icon={Timer} />
                  <Stat label="Cost / run" value={ciSummary.runCount > 0 ? `$${(ciSummary.totalCost / ciSummary.runCount).toFixed(4)}` : "—"} icon={Wallet} />
                </StatGrid>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">No CI data available.</p>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {!loading && !forecast && (
        <EmptyState icon={TrendingUp} title="No forecast data">
          Select a project with completed sprints to generate a forecast.
        </EmptyState>
      )}
    </div>
  );
}

function confidenceVariant(confidence: "low" | "medium" | "high") {
  switch (confidence) {
    case "high":
      return "success" as const;
    case "medium":
      return "info" as const;
    case "low":
      return "secondary" as const;
  }
}

function BudgetMeter({
  label,
  used,
  budget,
  unit,
  prefix = "",
}: {
  label: string;
  used: number;
  budget: number;
  unit: string;
  prefix?: string;
}) {
  const percent = Math.min(100, used);
  const color = percent >= 100 ? "bg-destructive" : percent >= 80 ? "bg-warning" : "bg-success";
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className={"tabular-nums " + (percent >= 100 ? "font-medium text-destructive" : "text-muted-foreground")}>
          {prefix}
          {budget.toLocaleString()} {unit} budget
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div className={"h-full rounded-full transition-all duration-[var(--duration-slow)] ease-[var(--ease-out)] " + color} style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{percent.toFixed(1)}% used</p>
    </div>
  );
}
