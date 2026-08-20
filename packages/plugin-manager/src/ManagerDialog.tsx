import { useCallback, useEffect, useState } from "react";
import { PluginManagerError } from "./errors.ts";
import { fetchSource, type InspectedPlugin, type Installed, sha256 } from "./installed.ts";

const field =
  "w-full rounded-control bg-field px-2.5 py-1.5 text-base text-ink shadow-hairline outline-none placeholder:text-ink-3 focus:shadow-[0_0_0_1px_var(--line-strong)]";
const button =
  "rounded-control px-2 py-1 text-sm text-ink-2 shadow-hairline hover:bg-hover hover:text-ink disabled:opacity-50";
const primary =
  "rounded-control bg-accent px-2.5 py-1 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";

const message = (error: unknown): string =>
  error instanceof PluginManagerError || error instanceof Error ? error.message : String(error);

/** What the source is being read from before it is reviewed. */
type AddMode = "url" | "paste";

/** The list, or the review step for one candidate plugin. */
type View =
  | { readonly kind: "list" }
  | {
      readonly kind: "review";
      readonly source: string;
      readonly url?: string | undefined;
      /** Set when this reviews a new version of an already-installed plugin. */
      readonly updating?: string | undefined;
    };

const statusNote: Record<InspectedPlugin["status"], string | undefined> = {
  ok: undefined,
  modified: "source changed since you approved it — will not run",
  missing: "source is missing from storage — will not run",
};

const statusTone: Record<InspectedPlugin["status"], string> = {
  ok: "text-ink-3",
  modified: "text-orange",
  missing: "text-red",
};

/**
 * The whole manager UI: what is installed, and the two ways to add more.
 *
 * Deliberately context-free — it takes a `Installed` and reports changes through
 * `onChanged`, so it can be rendered and driven in a test without a host. The
 * plugin wires `onChanged` to `ctx.reload()`.
 */
export function ManagerDialog({
  store,
  onChanged,
  onClose,
}: {
  store: Installed;
  onChanged: () => Promise<void> | void;
  onClose: () => void;
}) {
  const [installed, setInstalled] = useState<readonly InspectedPlugin[]>([]);
  const [view, setView] = useState<View>({ kind: "list" });
  const [mode, setMode] = useState<AddMode>("url");
  const [draft, setDraft] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | undefined>(undefined);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    void store.inspect().then(setInstalled, (caught: unknown) => setError(message(caught)));
  }, [store]);
  useEffect(refresh, [refresh]);

  /** Every mutation runs through here: one busy flag, one error surface. */
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (caught) {
      setError(message(caught));
    } finally {
      setBusy(false);
    }
  };

  const applied = async () => {
    refresh();
    await onChanged();
  };

  /* Reading the source is separate from installing it: nothing is written or
   * executed until the user has seen what they are about to run. */
  const review = () =>
    run(async () => {
      const source = mode === "url" ? await fetchSource(draft.trim()) : draft;
      if (source.trim() === "") throw new PluginManagerError("There is nothing to install");
      setName(suggestName(mode === "url" ? draft.trim() : undefined));
      setView({ kind: "review", source, ...(mode === "url" ? { url: draft.trim() } : {}) });
    });

  /** Fetch a new version and show it, rather than running it unseen. */
  const reviewUpdate = (plugin: InspectedPlugin) =>
    run(async () => {
      if (plugin.url === undefined) return;
      const source = await fetchSource(plugin.url);
      setName(plugin.name);
      setView({ kind: "review", source, url: plugin.url, updating: plugin.id });
    });

  const apply = (view: Extract<View, { kind: "review" }>) =>
    run(async () => {
      if (view.updating !== undefined) await store.update(view.updating, view.source);
      else await store.install({ name, source: view.source, url: view.url });
      setView({ kind: "list" });
      setDraft("");
      await applied();
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div
        role="dialog"
        aria-modal
        aria-label="Plugins"
        data-testid="plugin-manager"
        className="flex max-h-[80vh] w-full max-w-lg flex-col rounded-[14px] bg-surface p-4 shadow-overlay"
        style={{ animation: "pop-in 180ms var(--ease-out-strong) both" }}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink">Plugins</h2>
          <button type="button" className={button} onClick={onClose} data-testid="close-manager">
            Close
          </button>
        </div>

        {view.kind === "list" ? (
          <>
            <p className="mt-1 text-sm leading-relaxed text-ink-3">
              Plugins you add run with the same access as the app itself — they can read your
              conversations and call your endpoint. Only add code you trust.
            </p>

            <div className="mt-3 min-h-0 flex-1 overflow-y-auto" data-testid="installed-list">
              {installed.length === 0 ? (
                <p className="py-3 text-smd text-ink-3">Nothing installed yet.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {installed.map((plugin) => (
                    <li
                      key={plugin.id}
                      data-testid="installed-plugin"
                      className="flex items-center gap-2 rounded-control px-2 py-1.5 hover:bg-hover"
                    >
                      <label className="flex min-w-0 flex-1 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={plugin.enabled}
                          disabled={busy}
                          data-testid={`toggle-${plugin.name}`}
                          onChange={(event) =>
                            void run(async () => {
                              store.setEnabled(plugin.id, event.target.checked);
                              await applied();
                            })
                          }
                        />
                        <span className="min-w-0">
                          <span className="block truncate text-base text-ink">{plugin.name}</span>
                          <span className={`block truncate text-xs ${statusTone[plugin.status]}`}>
                            {statusNote[plugin.status] ?? plugin.url ?? "pasted source"}
                          </span>
                        </span>
                      </label>

                      {plugin.url !== undefined && (
                        <button
                          type="button"
                          className={button}
                          disabled={busy}
                          data-testid={`update-${plugin.name}`}
                          onClick={() => void reviewUpdate(plugin)}
                        >
                          Update
                        </button>
                      )}
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        data-testid={`remove-${plugin.name}`}
                        onClick={() =>
                          void run(async () => {
                            await store.remove(plugin.id);
                            await applied();
                          })
                        }
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-3 border-t border-line pt-3">
              <div className="flex gap-1">
                {(["url", "paste"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    data-testid={`mode-${option}`}
                    aria-pressed={mode === option}
                    className={`rounded-control px-2 py-1 text-sm ${
                      mode === option
                        ? "bg-accent-tint text-accent-ink"
                        : "text-ink-2 hover:bg-hover"
                    }`}
                    onClick={() => {
                      setMode(option);
                      setDraft("");
                      setError(undefined);
                    }}
                  >
                    {option === "url" ? "From URL" : "Paste code"}
                  </button>
                ))}
              </div>

              {mode === "url" ? (
                <input
                  className={`${field} mt-2`}
                  data-testid="add-url"
                  placeholder="https://example.com/my-plugin.js"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              ) : (
                <textarea
                  className={`${field} mt-2 h-28 resize-none font-mono text-sm`}
                  data-testid="add-source"
                  placeholder={"export default (pi) => {\n  pi.registerCommand(…)\n}"}
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                />
              )}

              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  className={primary}
                  data-testid="review-plugin"
                  disabled={busy || draft.trim() === ""}
                  onClick={() => void review()}
                >
                  {mode === "url" ? "Fetch" : "Continue"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <Review
            source={view.source}
            url={view.url}
            name={name}
            busy={busy}
            onName={setName}
            onCancel={() => setView({ kind: "list" })}
            updating={view.updating !== undefined}
            onInstall={() => void apply(view)}
          />
        )}

        {error !== undefined && (
          <p role="alert" className="mt-2 text-sm text-red" data-testid="manager-error">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

/** The approval step — the source, its hash, and a name to file it under. */
function Review({
  source,
  url,
  name,
  busy,
  updating,
  onName,
  onCancel,
  onInstall,
}: {
  source: string;
  url: string | undefined;
  name: string;
  busy: boolean;
  /** True when this is a new version of a plugin already installed. */
  updating: boolean;
  onName: (name: string) => void;
  onCancel: () => void;
  onInstall: () => void;
}) {
  const [hash, setHash] = useState("");
  useEffect(() => {
    void sha256(source).then(setHash);
  }, [source]);

  return (
    <div className="mt-2 flex min-h-0 flex-col" data-testid="review-step">
      <p className="text-sm leading-relaxed text-ink-3">
        {updating ? "This is the new version, and " : "This is "}the code that will run on every
        load. {url ?? "Pasted source"} — <span className="font-mono">{hash.slice(0, 12)}</span>
      </p>
      <input
        className={`${field} mt-2`}
        data-testid="review-name"
        placeholder="Name"
        value={name}
        onChange={(event) => onName(event.target.value)}
      />
      <pre
        data-testid="review-source"
        className="mt-2 min-h-0 flex-1 overflow-auto rounded-card bg-inset p-2.5 font-mono text-xs whitespace-pre text-ink-2"
      >
        {source}
      </pre>
      <div className="mt-2 flex justify-end gap-1">
        <button type="button" className={button} onClick={onCancel} data-testid="cancel-install">
          Cancel
        </button>
        <button
          type="button"
          className={primary}
          disabled={busy || name.trim() === ""}
          onClick={onInstall}
          data-testid="confirm-install"
        >
          {updating ? "Update and run" : "Add and run"}
        </button>
      </div>
    </div>
  );
}

/** A URL's filename makes a better default name than "Untitled". */
const suggestName = (url: string | undefined): string => {
  if (url === undefined) return "Pasted plugin";
  const last = url.split("?")[0]?.split("/").filter(Boolean).at(-1);
  return last === undefined || last === "" ? "Plugin" : last.replace(/\.[mc]?js$/, "");
};
