import { test } from "node:test";
import assert from "node:assert/strict";
import {
  roleRank,
  roleSatisfies,
  normalizeProjectRole,
  effectiveProjectRole,
  DEFAULT_PROJECT_ROLE,
} from "./roles.js";

test("roleRank", async (t) => {
  await t.test("orders roles viewer < member < admin < owner", () => {
    assert.ok(roleRank("viewer") < roleRank("member"));
    assert.ok(roleRank("member") < roleRank("admin"));
    assert.ok(roleRank("admin") < roleRank("owner"));
  });

  await t.test("is case-insensitive", () => {
    assert.equal(roleRank("OWNER"), roleRank("owner"));
  });

  await t.test("ranks unknown/empty as 0", () => {
    assert.equal(roleRank("bogus"), 0);
    assert.equal(roleRank(null), 0);
    assert.equal(roleRank(undefined), 0);
  });
});

test("roleSatisfies", async (t) => {
  await t.test("passes when actual exceeds or equals required", () => {
    assert.equal(roleSatisfies("admin", "member"), true);
    assert.equal(roleSatisfies("member", "member"), true);
    assert.equal(roleSatisfies("owner", "admin"), true);
  });

  await t.test("fails when actual is below required", () => {
    assert.equal(roleSatisfies("viewer", "member"), false);
    assert.equal(roleSatisfies("member", "admin"), false);
    assert.equal(roleSatisfies(null, "viewer"), false);
  });
});

test("normalizeProjectRole", async (t) => {
  await t.test("passes through known roles (case-insensitive)", () => {
    assert.equal(normalizeProjectRole("Admin"), "admin");
    assert.equal(normalizeProjectRole("viewer"), "viewer");
  });

  await t.test("defaults unknown values", () => {
    assert.equal(normalizeProjectRole("bogus"), DEFAULT_PROJECT_ROLE);
    assert.equal(normalizeProjectRole(null), DEFAULT_PROJECT_ROLE);
  });
});

test("effectiveProjectRole", async (t) => {
  await t.test("workspace admin/owner gets owner regardless of membership", () => {
    assert.equal(effectiveProjectRole("admin", null), "owner");
    assert.equal(effectiveProjectRole("owner", "viewer"), "owner");
  });

  await t.test("non-admin uses explicit membership role", () => {
    assert.equal(effectiveProjectRole("member", "admin"), "admin");
    assert.equal(effectiveProjectRole("member", "member"), "member");
  });

  await t.test("non-admin without membership falls back to the default", () => {
    assert.equal(effectiveProjectRole("member", null), DEFAULT_PROJECT_ROLE);
    assert.equal(effectiveProjectRole(null, undefined), DEFAULT_PROJECT_ROLE);
  });
});
