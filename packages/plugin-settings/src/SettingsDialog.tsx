import { API_TYPES, type ApiType, ChatApiError, describeError, listModels } from "@tiny/ai";
import { ModalShell, type PluginSettings } from "@tiny/plugin";
import { useState } from "react";

const field =
  "h-8 w-full rounded-control bg-field px-2.5 text-base text-ink shadow-hairline outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_1px_var(--line-strong)]";

/** pi's api type identifiers, with the names people know them by. */
const API_LABELS: Record<ApiType, string> = {
  "openai-completions": "OpenAI Chat Completions (and compatibles)",
  "openai-responses": "OpenAI Responses",
  "azure-openai-responses": "Azure OpenAI Responses",
  "anthropic-messages": "Anthropic Messages",
  "mistral-conversations": "Mistral",
  "google-generative-ai": "Google Generative AI",
};

// Anthropic and Mistral append their own `/v1`; including it here would produce `/v1/v1/messages`.
const BASE_URL_HINTS: Record<ApiType, string> = {
  "openai-completions": "https://api.openai.com/v1",
  "openai-responses": "https://api.openai.com/v1",
  "azure-openai-responses": "https://<resource>.openai.azure.com/openai/v1",
  "anthropic-messages": "https://api.anthropic.com",
  "mistral-conversations": "https://api.mistral.ai",
  "google-generative-ai": "https://generativelanguage.googleapis.com/v1beta",
};

/** Endpoint configuration; saving verifies the endpoint by listing its models. */
export function SettingsDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: PluginSettings | undefined;
  onSave: (settings: PluginSettings, models: readonly string[]) => void;
  onClose: (() => void) | undefined;
}) {
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [api, setApi] = useState<ApiType>(initial?.api ?? "openai-completions");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const save = async () => {
    setError(undefined);
    setChecking(true);
    try {
      const endpoint = { baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), api };
      const models = await listModels(endpoint);
      const model =
        initial !== undefined && models.includes(initial.model)
          ? initial.model
          : (models[0] ?? initial?.model ?? "");
      onSave({ ...endpoint, model }, models);
    } catch (caught) {
      setError(
        caught instanceof ChatApiError
          ? describeError(caught)
          : "Could not reach the endpoint — check the base URL.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <ModalShell label="Settings">
      <h2 className="text-lg font-semibold text-ink">Settings</h2>
      <p className="mt-1 text-sm leading-relaxed text-ink-3">
        Any endpoint pi can stream from. Your key stays in this browser and is only sent to the base
        URL below.
      </p>
      <form
        className="mt-3 flex flex-col gap-2.5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-2">
          API
          <select
            value={api}
            data-testid="api-type"
            onChange={(event) => setApi(event.target.value as ApiType)}
            className={field}
          >
            {API_TYPES.map((type) => (
              <option key={type} value={type}>
                {API_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-2">
          Base URL
          <input
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
            placeholder={BASE_URL_HINTS[api]}
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-ink-2">
          API key
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-…"
            className={field}
          />
        </label>
        {error !== undefined && (
          <p role="alert" className="text-sm text-red">
            {error}
          </p>
        )}
        <div className="mt-1 flex items-center justify-end gap-1.5">
          {onClose !== undefined && (
            <button
              type="button"
              onClick={onClose}
              className="flex h-8 items-center rounded-control px-3 text-smd font-medium text-ink-2 transition-colors duration-150 hover:bg-hover"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={checking || baseUrl.trim() === "" || apiKey.trim() === ""}
            className="flex h-8 items-center rounded-control bg-ink px-3 text-smd font-medium text-surface transition-[opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-40"
          >
            {checking ? "Checking…" : "Save"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
