import type { Endpoint } from "@tiny/ai";

export type Settings = Endpoint & { readonly model: string };

const KEY = "tiny-chat:settings";

const isSettings = (value: unknown): value is Settings =>
  typeof value === "object" &&
  value !== null &&
  "baseUrl" in value &&
  typeof value.baseUrl === "string" &&
  "apiKey" in value &&
  typeof value.apiKey === "string" &&
  "model" in value &&
  typeof value.model === "string";

export function loadSettings(): Settings | undefined {
  const raw = localStorage.getItem(KEY);
  if (raw === null) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    return isSettings(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

/** A settings object is usable once every field is non-empty. */
export const settingsComplete = (settings: Settings | undefined): settings is Settings =>
  settings !== undefined &&
  settings.baseUrl.trim() !== "" &&
  settings.apiKey.trim() !== "" &&
  settings.model.trim() !== "";
