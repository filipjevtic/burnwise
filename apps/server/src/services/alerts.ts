import type { PrismaClient } from "../generated/prisma/client.js";
import { rollupEvents } from "./rollup.js";

export interface Alert {
  type: "token" | "cost";
  level: "warning" | "critical";
  message: string;
  usagePercent: number;
  budget: number;
  usage: number;
}

export async function getProjectAlerts(
  prisma: PrismaClient,
  projectId: string
): Promise<Alert[]> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
  });

  if (!project) {
    throw new Error("Project not found");
  }

  const events = await prisma.event.findMany({
    where: { projectId },
  });

  const { tokens: totalTokens, cost: totalCost } = rollupEvents(events);

  const alerts: Alert[] = [];

  if (project.tokenBudget && project.tokenBudget > 0 && totalTokens > 0) {
    const percent = (totalTokens / project.tokenBudget) * 100;
    const threshold = project.tokenBudgetAlertThreshold ?? 80;
    if (percent >= threshold) {
      alerts.push({
        type: "token",
        level: percent >= 100 ? "critical" : "warning",
        message: `Project token usage is ${percent.toFixed(1)}% of the budget`,
        usagePercent: percent,
        budget: project.tokenBudget,
        usage: totalTokens,
      });
    }
  }

  if (project.costBudget && project.costBudget > 0 && totalCost > 0) {
    const percent = (totalCost / project.costBudget) * 100;
    const threshold = project.costBudgetAlertThreshold ?? 80;
    if (percent >= threshold) {
      alerts.push({
        type: "cost",
        level: percent >= 100 ? "critical" : "warning",
        message: `Project cost usage is ${percent.toFixed(1)}% of the budget`,
        usagePercent: percent,
        budget: project.costBudget,
        usage: totalCost,
      });
    }
  }

  return alerts;
}

export async function getSprintAlerts(
  prisma: PrismaClient,
  sprintId: string
): Promise<Alert[]> {
  const sprint = await prisma.sprint.findUnique({
    where: { id: sprintId },
    include: { tickets: { include: { events: true } } },
  });

  if (!sprint) {
    throw new Error("Sprint not found");
  }

  const { tokens: totalTokens, cost: totalCost } = rollupEvents(
    sprint.tickets.flatMap((t) => t.events)
  );

  const alerts: Alert[] = [];

  if (sprint.tokenBudget && sprint.tokenBudget > 0 && totalTokens > 0) {
    const percent = (totalTokens / sprint.tokenBudget) * 100;
    const threshold = sprint.tokenBudgetAlertThreshold ?? 80;
    if (percent >= threshold) {
      alerts.push({
        type: "token",
        level: percent >= 100 ? "critical" : "warning",
        message: `Sprint token usage is ${percent.toFixed(1)}% of the budget`,
        usagePercent: percent,
        budget: sprint.tokenBudget,
        usage: totalTokens,
      });
    }
  }

  if (sprint.costBudget && sprint.costBudget > 0 && totalCost > 0) {
    const percent = (totalCost / sprint.costBudget) * 100;
    const threshold = sprint.costBudgetAlertThreshold ?? 80;
    if (percent >= threshold) {
      alerts.push({
        type: "cost",
        level: percent >= 100 ? "critical" : "warning",
        message: `Sprint cost usage is ${percent.toFixed(1)}% of the budget`,
        usagePercent: percent,
        budget: sprint.costBudget,
        usage: totalCost,
      });
    }
  }

  return alerts;
}
