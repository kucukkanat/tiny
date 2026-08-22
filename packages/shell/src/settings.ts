import { type ApiType, type Endpoint, isApiType } from "@tiny/ai";

/**
 * The user's own endpoint, plus which model is selected.
 *
 * `providerId` names a plugin-registered provider when the selected model came
 * from one; absent means the endpoint below, which is also what every settings
 * object saved before providers existed parses as. That is why it is an added
 * optional field rather than a restructure — old saved settings load unchanged.
 */
export type Settings = Endpoint & {
  readonly model: string;
  readonly providerId?: string | undefined;
  /** What the user's own endpoint speaks; absent means `openai-completions`. */
  readonly api?: ApiType | undefined;
};

/**
 * The built-in provider's id.
 *
 * Re-exported rather than restated: `@tiny/ai` stamps this same id onto every
 * model descriptor it builds, and `ChatShell` routes on the two being equal. Two
 * copies of the literal would let them drift, and the symptom — every
 * conversation silently losing its endpoint — points nowhere near the cause.
 */
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
  // Absent is the norm for both; anything present has to be usable.
  (!("providerId" in value) ||
    value.providerId === undefined ||
    typeof value.providerId === "string") &&
  // An api this build does not support reads back as unset rather than
  // poisoning the whole settings object.
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
