import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.tsx";
// Self-hosted variable fonts (bundled by Vite — no runtime CDN). Weight axis
// only, so there's no FOUT and the payload stays small. Imported from JS so
// Vite's asset pipeline rewrites the .woff2 URLs correctly.
import "@fontsource-variable/inter/wght.css";
import "@fontsource-variable/jetbrains-mono/wght.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
