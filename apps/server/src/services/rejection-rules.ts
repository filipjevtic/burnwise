import type { Prisma } from "../generated/prisma/client.js";

/** Event columns a rejection rule may match on (#24 follow-up). */
export const REJECTION_RULE_FIELDS = ["source", "userId"] as const;
export type RejectionRuleField = (typeof REJECTION_RULE_FIELDS)[number];

export function isRejectionRuleField(value: unknown): value is RejectionRuleField {
  return typeof value === "string" && (REJECTION_RULE_FIELDS as readonly string[]).includes(value);
}

export interface RejectionRuleInput {
  field: string;
  value: string;
}

/**
 * Build the Prisma OR-conditions that match every event covered by any rule.
 * The caller wraps the result in `NOT` to exclude those events from the
 * unresolved queue. Rules are grouped per field into `in` lists (one clause per
 * field); unknown fields are ignored. Returns [] when nothing applies, so the
 * caller can skip adding any exclusion.
 */
export function buildRuleExclusion(rules: RejectionRuleInput[]): Prisma.EventWhereInput[] {
  const byField = new Map<RejectionRuleField, string[]>();
  for (const rule of rules) {
    if (!isRejectionRuleField(rule.field)) continue;
    const list = byField.get(rule.field) ?? [];
    list.push(rule.value);
    byField.set(rule.field, list);
  }
  return [...byField.entries()].map(([field, values]) => ({ [field]: { in: values } }));
}
