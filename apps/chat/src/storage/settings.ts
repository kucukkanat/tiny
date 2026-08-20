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

/** The built-in provider's id — `@tiny/ai` tags its models with the same name. */
export const OWN_ENDPOINT = "endpoint";

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

/**
 * A settings object is usable once every field is non-empty.
 *
 * Still only about the user's *own* endpoint: a plugin provider supplies its own
 * base URL and key, so a conversation can run through one while this is false.
 * `App` asks `canSend` for that question.
 */
export const settingsComplete = (settings: Settings | undefined): settings is Settings =>
  settings !== undefined &&
  settings.baseUrl.trim() !== "" &&
  settings.apiKey.trim() !== "" &&
  settings.model.trim() !== "";
