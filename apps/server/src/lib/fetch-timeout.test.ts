import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fetchWithTimeout, FetchTimeoutError, DEFAULT_FETCH_TIMEOUT_MS } from "./fetch-timeout.js";

let server: http.Server;
let base: string;

before(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/fast") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    // /slow: never respond, hold the socket open.
  });
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  base = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("fetchWithTimeout", () => {
  it("returns the response when the server answers in time", async () => {
    const res = await fetchWithTimeout(`${base}/fast`, {}, 2000);
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true });
  });

  it("throws FetchTimeoutError when the server hangs past the deadline", async () => {
    await assert.rejects(
      () => fetchWithTimeout(`${base}/slow`, {}, 100),
      (err: unknown) => {
        assert.ok(err instanceof FetchTimeoutError, "expected FetchTimeoutError");
        assert.match((err as Error).message, /timed out after 100ms/);
        return true;
      }
    );
  });

  it("exposes a sane default timeout", () => {
    assert.strictEqual(DEFAULT_FETCH_TIMEOUT_MS, 30_000);
  });
});
