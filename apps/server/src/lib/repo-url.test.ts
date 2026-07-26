import { describe, it } from "node:test";
import assert from "node:assert";
import { parseGitHubRepo, parseGitLabProjectPath } from "./repo-url.js";

describe("parseGitHubRepo", () => {
  it("passes through plain owner + repo", () => {
    assert.deepEqual(parseGitHubRepo("foo", "bar"), { owner: "foo", repo: "bar" });
  });
  it("splits a full URL pasted in the repo field", () => {
    assert.deepEqual(parseGitHubRepo("", "https://github.com/foo/bar"), { owner: "foo", repo: "bar" });
  });
  it("strips a .git suffix and trailing slash", () => {
    assert.deepEqual(parseGitHubRepo("foo", "bar.git"), { owner: "foo", repo: "bar" });
    assert.deepEqual(parseGitHubRepo("", "https://github.com/foo/bar/"), { owner: "foo", repo: "bar" });
  });
  it("handles owner/repo in the repo field", () => {
    assert.deepEqual(parseGitHubRepo("ignored", "foo/bar"), { owner: "foo", repo: "bar" });
  });
  it("handles a full URL pasted in the owner field", () => {
    assert.deepEqual(parseGitHubRepo("https://github.com/foo/bar", ""), { owner: "foo", repo: "bar" });
  });
  it("handles the git@ SSH form", () => {
    assert.deepEqual(parseGitHubRepo("", "git@github.com:foo/bar.git"), { owner: "foo", repo: "bar" });
  });
  it("returns null when nothing usable is given", () => {
    assert.equal(parseGitHubRepo("", ""), null);
    assert.equal(parseGitHubRepo("foo", ""), null);
  });
});

describe("parseGitLabProjectPath", () => {
  it("keeps a group/project path", () => {
    assert.equal(parseGitLabProjectPath("group/project"), "group/project");
  });
  it("keeps nested subgroups", () => {
    assert.equal(parseGitLabProjectPath("group/sub/project"), "group/sub/project");
  });
  it("strips a full URL and .git", () => {
    assert.equal(parseGitLabProjectPath("https://gitlab.com/group/project.git"), "group/project");
  });
  it("returns null for an incomplete path", () => {
    assert.equal(parseGitLabProjectPath("justone"), null);
    assert.equal(parseGitLabProjectPath(""), null);
  });
});
