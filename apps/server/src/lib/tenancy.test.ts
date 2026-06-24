import { test } from "node:test";
import assert from "node:assert/strict";
import { canOnboardWorkspace } from "./tenancy.js";

test("canOnboardWorkspace", async (t) => {
  await t.test("allows the first workspace when multi-workspace is off", () => {
    assert.equal(canOnboardWorkspace(0, false), true);
  });

  await t.test("blocks a second workspace when multi-workspace is off", () => {
    assert.equal(canOnboardWorkspace(1, false), false);
    assert.equal(canOnboardWorkspace(5, false), false);
  });

  await t.test("always allows when multi-workspace is on", () => {
    assert.equal(canOnboardWorkspace(0, true), true);
    assert.equal(canOnboardWorkspace(3, true), true);
  });

  await t.test("treats negative/odd counts as no workspaces", () => {
    assert.equal(canOnboardWorkspace(-1, false), true);
  });
});
