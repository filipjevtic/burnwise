// Single source of the API base URL for every client request.
//
// - Unset (local dev via `npm run dev`): defaults to the server on :3000.
// - Empty string: same-origin. Production images build with VITE_API_URL="" so
//   requests go to `/api/...` on the page's own host and the web container's
//   nginx proxies them to the server (#22). One built image then works in dev,
//   Docker Compose, and Kubernetes with no per-deploy rebuild.
//
// `??` (not `||`) so an explicit "" is honored as same-origin rather than
// falling back to localhost.
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
