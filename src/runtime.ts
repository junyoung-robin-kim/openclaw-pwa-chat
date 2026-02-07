// PluginRuntime singleton

import type { PluginRuntime } from "openclaw/plugin-sdk";

let runtime: PluginRuntime | null = null;

export function setRuntime(next: PluginRuntime): void {
  runtime = next;
}

export function getRuntime(): PluginRuntime {
  if (!runtime) throw new Error("PWA Chat runtime not initialized");
  return runtime;
}
