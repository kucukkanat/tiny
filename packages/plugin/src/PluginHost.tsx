import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type AppBridge, HostContext, type HostValue, type Widget } from "./context.ts";
import { Dialog, type DialogRequest, type Toast, Toasts } from "./Dialogs.tsx";
import { emptyRegistry, loadPlugins, type Registry } from "./host.ts";
import { matchesKey } from "./keys.ts";
import { identityTheme } from "./theme.ts";
import type {
  CommandInfo,
  DialogOptions,
  Plugin,
  PluginContext,
  PluginUIContext,
  WidgetOptions,
} from "./types.ts";

const newId = () => crypto.randomUUID();

const emptyBridge: AppBridge = {
  messages: [],
  streaming: undefined,
  settings: undefined,
  signal: undefined,
  send: () => {},
  stop: () => {},
  updateSettings: () => {},
  navigate: () => {},
};

/**
 * Runs the plugin registry and owns every piece of UI state plugins can drive:
 * the dialog queue, notifications, widgets and status entries.
 *
 * The app's own composition is untouched — `App` publishes its chat state in
 * with `useProvideApp` and renders `<Slot>`s where contributions belong.
 */
export function PluginHost({
  plugins,
  children,
}: {
  plugins: readonly Plugin[];
  children: ReactNode;
}) {
  const [registry, setRegistry] = useState<Registry>(emptyRegistry);
  const [dialogs, setDialogs] = useState<readonly DialogRequest[]>([]);
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const [widgets, setWidgets] = useState<ReadonlyMap<string, Widget>>(new Map());
  const [statuses, setStatuses] = useState<ReadonlyMap<string, string>>(new Map());
  const [editorText, setEditorText] = useState("");

  // State, not a ref: contributed components read chat state through the
  // context and must re-render when it moves.
  const [bridge, setBridge] = useState<AppBridge>(emptyBridge);
  const resolvers = useRef(new Map<string, (value: unknown) => void>());

  // Bumped by `reload()`. The registry is rebuilt from scratch on every load,
  // so a plugin dropped from the list also loses its commands, tools, slots and
  // event handlers — there is no separate unregister path to keep in step.
  const [nonce, setNonce] = useState(0);
  const reloading = useRef<(() => void)[]>([]);

  // Factories may be async, so the registry arrives after first paint; the app
  // renders immediately and contributions appear when they are ready.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the reload trigger — the effect re-runs on it rather than reading it
  useEffect(() => {
    let live = true;
    const settleReloads = () => {
      for (const done of reloading.current.splice(0)) done();
    };
    loadPlugins(plugins).then(
      (loaded) => {
        if (!live) return;
        setRegistry(loaded);
        settleReloads();
      },
      (error: unknown) => {
        console.error("[plugin] failed to load", error);
        // A failed load still ends the wait — `reload()` promises that the
        // attempt is over, not that it succeeded.
        if (live) settleReloads();
      },
    );
    return () => {
      live = false;
    };
  }, [plugins, nonce]);

  /** Re-run every factory, resolving once the new registry is in place. */
  const reload = useCallback(
    () =>
      new Promise<void>((resolve) => {
        reloading.current.push(resolve);
        setNonce((current) => current + 1);
      }),
    [],
  );

  const settle = useCallback((id: string, value: unknown) => {
    const resolve = resolvers.current.get(id);
    if (resolve === undefined) return;
    resolvers.current.delete(id);
    setDialogs((open) => open.filter((request) => request.id !== id));
    resolve(value);
  }, []);

  /**
   * One dialog request, resolved by the user, by `opts.timeout`, or by
   * `opts.signal` — the same three outcomes pi documents, with pi's fallback
   * values on the latter two.
   */
  const ask = useCallback(
    <T,>(build: (id: string) => DialogRequest, opts: DialogOptions | undefined, onDismiss: T) =>
      new Promise<T>((resolve) => {
        const id = newId();
        resolvers.current.set(id, (value) => resolve(value as T));
        setDialogs((open) => [...open, build(id)]);

        if (opts?.timeout !== undefined) {
          const timer = setTimeout(() => settle(id, onDismiss), opts.timeout);
          const stop = () => clearTimeout(timer);
          resolvers.current.set(id, (value) => {
            stop();
            resolve(value as T);
          });
        }
        if (opts?.signal !== undefined) {
          const abort = () => settle(id, onDismiss);
          if (opts.signal.aborted) abort();
          else opts.signal.addEventListener("abort", abort, { once: true });
        }
      }),
    [settle],
  );

  const ui = useMemo<PluginUIContext>(
    () => ({
      /* — portable: dialogs — */
      select: (title, options, opts) =>
        ask<string | undefined>((id) => ({ kind: "select", id, title, options }), opts, undefined),
      confirm: (title, message, opts) =>
        ask<boolean>((id) => ({ kind: "confirm", id, title, message }), opts, false),
      input: (title, placeholder, opts) =>
        ask<string | undefined>(
          (id) => ({ kind: "input", id, title, placeholder }),
          opts,
          undefined,
        ),
      editor: (title, prefill) =>
        ask<string | undefined>(
          (id) => ({ kind: "editor", id, title, prefill }),
          undefined,
          undefined,
        ),

      /* — portable: fire-and-forget — */
      notify: (message, type = "info") => {
        const id = newId();
        setToasts((current) => [...current, { id, message, type }]);
        setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
      },
      setStatus: (key, text) =>
        setStatuses((current) => {
          const next = new Map(current);
          if (text === undefined) next.delete(key);
          else next.set(key, text);
          return next;
        }),
      setWidget: (key, content, options?: WidgetOptions) =>
        setWidgets((current) => {
          const next = new Map(current);
          if (content === undefined) next.delete(key);
          else next.set(key, { lines: content, placement: options?.placement ?? "aboveEditor" });
          return next;
        }),
      setTitle: (title) => {
        document.title = title;
      },
      setEditorText,
      pasteToEditor: (text) => setEditorText((current) => current + text),

      /* — ours — */
      open: <T,>(render: (done: (result: T) => void) => ReactNode) =>
        ask<T | undefined>(
          (id) => ({
            kind: "custom",
            id,
            render: (done) => render(done as (result: T) => void),
          }),
          undefined,
          undefined,
        ),

      /* — terminal-only: pi's documented RPC fallbacks — */
      theme: identityTheme,
      custom: async () => undefined,
      getEditorText: () => "",
      getToolsExpanded: () => false,
      setToolsExpanded: () => {},
      setWorkingMessage: () => {},
      setWorkingVisible: () => {},
      setWorkingIndicator: () => {},
      setHiddenThinkingLabel: () => {},
      setFooter: () => {},
      setHeader: () => {},
      setEditorComponent: () => {},
      getEditorComponent: () => undefined,
      onTerminalInput: () => () => {},
      addAutocompleteProvider: () => {},
      getAllThemes: () => [],
      getTheme: () => undefined,
      setTheme: () => ({ success: false, error: "themes are not available in the React host" }),
    }),
    [ask],
  );

  const commands = useMemo<readonly CommandInfo[]>(
    () =>
      registry.commands.map(({ invocationName, options }) => ({
        name: invocationName,
        description: options.description,
      })),
    [registry],
  );

  const contextFor = useCallback(
    (pluginId: string): PluginContext => ({
      ui,
      mode: "react",
      hasUI: true,
      signal: bridge.signal,
      chat: {
        messages: bridge.messages,
        streaming: bridge.streaming,
        send: bridge.send,
        stop: bridge.stop,
      },
      settings: bridge.settings,
      updateSettings: bridge.updateSettings,
      navigate: bridge.navigate,
      storage: namespacedStorage(pluginId),
      runCommand: (name, args) => runCommandRef.current(name, args),
      commands,
      reload,
    }),
    [ui, commands, bridge, reload],
  );

  const runCommand = useCallback(
    async (name: string, args = "") => {
      const entry = registry.commands.find(
        (command) => command.invocationName === name || command.name === name,
      );
      if (entry === undefined) {
        console.error(`[plugin] no such command: ${name}`);
        return;
      }
      // A throwing handler must not take the app down with it.
      try {
        await entry.options.handler(args, contextFor(entry.pluginId));
      } catch (error) {
        console.error(`[plugin:${entry.pluginId}] command "${name}" failed`, error);
        ui.notify(`Command "${name}" failed`, "error");
      }
    },
    [registry, contextFor, ui],
  );

  // `contextFor` hands plugins `runCommand`, and `runCommand` builds contexts —
  // the ref breaks the cycle without making either unstable.
  const runCommandRef = useRef(runCommand);
  useEffect(() => {
    runCommandRef.current = runCommand;
  }, [runCommand]);

  useEffect(() => {
    if (registry.shortcuts.length === 0) return;
    const onKey = (event: KeyboardEvent) => {
      for (const entry of registry.shortcuts) {
        if (!matchesKey(event, entry.shortcut)) continue;
        event.preventDefault();
        void (async () => {
          try {
            await entry.options.handler(contextFor(entry.pluginId));
          } catch (error) {
            console.error(`[plugin:${entry.pluginId}] shortcut failed`, error);
          }
        })();
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [registry, contextFor]);

  // Skip the update when nothing actually moved. `useProvideApp` is called with
  // a fresh object every render, so without this an app that rebuilds one
  // identical bridge per render would re-render the host forever.
  const publish = useCallback((next: AppBridge) => {
    setBridge((current) => (sameBridge(current, next) ? current : next));
  }, []);

  const value = useMemo<HostValue>(
    () => ({
      registry,
      widgets,
      statuses,
      commands,
      editorText,
      setEditorText,
      runCommand,
      contextFor,
      publish,
    }),
    [registry, widgets, statuses, commands, editorText, runCommand, contextFor, publish],
  );

  const current = dialogs[0];

  return (
    <HostContext.Provider value={value}>
      {children}
      {current !== undefined && (
        <Dialog
          request={current}
          onResolve={(result) => settle(current.id, result)}
          onCancel={() => settle(current.id, current.kind === "confirm" ? false : undefined)}
        />
      )}
      <Toasts toasts={toasts} />
    </HostContext.Provider>
  );
}

const BRIDGE_KEYS = [
  "messages",
  "streaming",
  "settings",
  "signal",
  "send",
  "stop",
  "updateSettings",
  "navigate",
] as const satisfies readonly (keyof AppBridge)[];

const sameBridge = (a: AppBridge, b: AppBridge): boolean =>
  BRIDGE_KEYS.every((key) => Object.is(a[key], b[key]));

/** Per-plugin localStorage, so a plugin cannot reach the app's own keys. */
const namespacedStorage = (pluginId: string) => {
  const prefix = `tiny-plugin:${pluginId}:`;
  return {
    get<T>(key: string): T | undefined {
      const raw = localStorage.getItem(prefix + key);
      if (raw === null) return undefined;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return undefined;
      }
    },
    set(key: string, value: unknown) {
      localStorage.setItem(prefix + key, JSON.stringify(value));
    },
    remove(key: string) {
      localStorage.removeItem(prefix + key);
    },
  };
};
