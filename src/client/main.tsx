import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles/index.css";

const root = document.getElementById("app");
if (!root) throw new Error("Root element #app not found");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/service-worker.js").catch((err) => console.error("[sw]", err));
}
