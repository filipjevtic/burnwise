import type { Page } from "@playwright/test";

const API_URL = "http://localhost:3000";
const TOKEN_KEY = "burnwise_token";

export async function loginAs(page: Page, email = "e2e@test.com", password = "e2epassword") {
  const res = await page.request.post(`${API_URL}/api/v1/auth/login`, {
    data: { email, password },
  });
  if (res.ok()) {
    const { token } = await res.json();
    await page.goto("/");
    await page.evaluate(
      ([key, val]) => localStorage.setItem(key, val),
      [TOKEN_KEY, token]
    );
    return;
  }
  throw new Error(`Login failed: ${res.status()} ${await res.text()}`);
}

export async function ensureE2EUser() {
  const http = await import("http");
  return new Promise<void>((resolve, reject) => {
    const body = JSON.stringify({
      email: "e2e@test.com",
      password: "e2epassword",
      displayName: "E2E User",
    });
    const req = http.request(
      {
        hostname: "localhost",
        port: 3000,
        path: "/api/v1/auth/login",
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body) },
      },
      (res) => {
        if (res.statusCode === 200 || res.statusCode === 201) return resolve();
        reject(new Error(`Unexpected status ${res.statusCode}`));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}
