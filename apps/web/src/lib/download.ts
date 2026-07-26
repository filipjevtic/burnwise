import { API_URL } from "./api-url.js";

/**
 * Fetch an authenticated CSV endpoint and trigger a browser download. The
 * endpoint requires a JWT, so we can't use a plain anchor link; we fetch with
 * the Authorization header and save the resulting blob.
 */
export async function downloadCsv(path: string, filename: string, token: string | null): Promise<void> {
  const res = await fetch(`${API_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
