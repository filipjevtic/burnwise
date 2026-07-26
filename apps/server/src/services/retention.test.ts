import { describe, it } from "node:test";
import assert from "node:assert";
import { retentionCutoff, purgeOldEvents } from "./retention.js";

describe("retentionCutoff", () => {
  it("subtracts the given days from now", () => {
    const now = new Date("2026-07-26T00:00:00.000Z");
    assert.equal(retentionCutoff(now, 90).toISOString(), "2026-04-27T00:00:00.000Z");
    assert.equal(retentionCutoff(now, 1).toISOString(), "2026-07-25T00:00:00.000Z");
  });
});

describe("purgeOldEvents", () => {
  // Minimal prisma stand-in capturing the deleteMany args.
  function fakePrisma(count: number) {
    const calls: unknown[] = [];
    return {
      calls,
      event: {
        deleteMany: async (args: unknown) => {
          calls.push(args);
          return { count };
        },
      },
    } as any;
  }

  it("deletes events older than the cutoff and returns the count", async () => {
    const prisma = fakePrisma(7);
    const now = new Date("2026-07-26T00:00:00.000Z");
    const removed = await purgeOldEvents(prisma, 30, now);
    assert.equal(removed, 7);
    assert.deepEqual(prisma.calls[0], { where: { timestamp: { lt: new Date("2026-06-26T00:00:00.000Z") } } });
  });

  it("is a no-op when retention is disabled (days <= 0)", async () => {
    const prisma = fakePrisma(99);
    assert.equal(await purgeOldEvents(prisma, 0), 0);
    assert.equal(await purgeOldEvents(prisma, -5), 0);
    assert.equal(prisma.calls.length, 0);
  });

  it("is a no-op for a non-finite window", async () => {
    const prisma = fakePrisma(99);
    assert.equal(await purgeOldEvents(prisma, NaN), 0);
    assert.equal(prisma.calls.length, 0);
  });
});
