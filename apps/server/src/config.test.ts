import { describe, it } from "node:test";
import assert from "node:assert";
import { validateConfig, config, DEFAULT_JWT_SECRET, DEFAULT_INGEST_API_KEY } from "./config.js";

// A production config with everything set correctly, as a baseline to mutate.
function prodConfig(overrides: Partial<typeof config> = {}): typeof config {
  return {
    ...config,
    nodeEnv: "production",
    jwtSecret: "a-strong-random-secret-value",
    ingestApiKey: "a-strong-ingest-key",
    encryptionKey: "0123456789abcdef0123456789abcdef",
    ...overrides,
  };
}

describe("validateConfig", () => {
  it("passes a fully-configured production install", () => {
    const { fatal, warnings } = validateConfig(prodConfig());
    assert.deepEqual(fatal, []);
    assert.deepEqual(warnings, []);
  });

  it("is fatal when JWT_SECRET is the default in production", () => {
    const { fatal } = validateConfig(prodConfig({ jwtSecret: DEFAULT_JWT_SECRET }));
    assert.equal(fatal.length, 1);
    assert.match(fatal[0], /JWT_SECRET/);
  });

  it("is fatal when JWT_SECRET is empty in production", () => {
    const { fatal } = validateConfig(prodConfig({ jwtSecret: "" }));
    assert.equal(fatal.length, 1);
  });

  it("warns (not fatal) on default ingest key and missing encryption key", () => {
    const { fatal, warnings } = validateConfig(
      prodConfig({ ingestApiKey: DEFAULT_INGEST_API_KEY, encryptionKey: "" })
    );
    assert.deepEqual(fatal, []);
    assert.equal(warnings.length, 2);
  });

  it("allows all dev defaults outside production", () => {
    const { fatal, warnings } = validateConfig({
      ...config,
      nodeEnv: "development",
      jwtSecret: DEFAULT_JWT_SECRET,
      ingestApiKey: DEFAULT_INGEST_API_KEY,
      encryptionKey: "",
    });
    assert.deepEqual(fatal, []);
    assert.deepEqual(warnings, []);
  });
});
