import { ChatApiError, describeError, listModels } from "@tiny/ai";
import { useState } from "react";
import type { Settings } from "../storage/settings.ts";

const field =
  "h-8 w-full rounded-control bg-field px-2.5 text-[13px] text-ink shadow-hairline outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_1px_var(--line-strong)]";

/* Endpoint configuration. Saving verifies the endpoint by listing its models
 * and picks the first one when none is chosen yet. */
export function SettingsDialog({
  initial,
  onSave,
  onClose,
}: {
  initial: Settings | undefined;
  onSave: (settings: Settings, models: readonly string[]) => void;
  onClose: (() => void) | undefined;
}) {
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? "");
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);

  const save = async () => {
    setError(undefined);
    setChecking(true);
    try {
      const endpoint = { baseUrl: baseUrl.trim(), apiKey: apiKey.trim() };
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        role="dialog"
        aria-modal
        aria-label="Settings"
        className="w-full max-w-sm rounded-[14px] bg-surface p-4 shadow-overlay"
        style={{ animation: "pop-in 180ms var(--ease-out-strong) both" }}
      >
        <h2 className="text-[14px] font-semibold text-ink">Settings</h2>
        <p className="mt-1 text-[12px] leading-relaxed text-ink-3">
          Any OpenAI-compatible endpoint. Your key stays in this browser and is only sent to the
          base URL below.
        </p>
        <form
          className="mt-3 flex flex-col gap-2.5"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-2">
            Base URL
            <input
              value={baseUrl}
              onChange={(event) => setBaseUrl(event.target.value)}
              placeholder="https://api.openai.com/v1"
              className={field}
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] font-medium text-ink-2">
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
            <p role="alert" className="text-[12px] text-red">
              {error}
            </p>
          )}
          <div className="mt-1 flex items-center justify-end gap-1.5">
            {onClose !== undefined && (
              <button
                type="button"
                onClick={onClose}
                className="flex h-8 items-center rounded-control px-3 text-[12.5px] font-medium text-ink-2 transition-colors duration-150 hover:bg-hover"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={checking || baseUrl.trim() === "" || apiKey.trim() === ""}
              className="flex h-8 items-center rounded-control bg-ink px-3 text-[12.5px] font-medium text-surface transition-[opacity,transform] duration-150 active:scale-[0.97] disabled:opacity-40"
            >
              {checking ? "Checking…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
