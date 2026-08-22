import { type ApiType, type Endpoint, isApiType } from "@tiny/ai";

/** The user's own endpoint plus selected model. `providerId` names a plugin provider;
 * absent means this endpoint, so pre-provider saved settings load unchanged. */
export type Settings = Endpoint & {
  readonly model: string;
  readonly providerId?: string | undefined;
  /** What the user's own endpoint speaks; absent means `openai-completions`. */
  readonly api?: ApiType | undefined;
};

/** The built-in provider's id, re-exported from `@tiny/ai` so the two cannot drift. */
export { PROVIDER_ID as OWN_ENDPOINT } from "@tiny/ai";

const KEY = "tiny-chat:settings";

const isSettings = (value: unknown): value is Settings =>
  typeof value === "object" &&
  value !== null &&
  "baseUrl" in value &&
  typeof value.baseUrl === "string" &&
  "apiKey" in value &&
  typeof value.apiKey === "string" &&
  "model" in value &&
  typeof value.model === "string" &&
  (!("providerId" in value) ||
    value.providerId === undefined ||
    typeof value.providerId === "string") &&
  // An unsupported api reads back as unset rather than poisoning the settings.
  (!("api" in value) || value.api === undefined || isApiType(value.api));

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
