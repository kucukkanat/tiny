import type { Extension } from "@tiny/ai";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEvents } from "./events.ts";
import { type AppBridge, HostContext, type HostValue, type Widget } from "./hooks.ts";
import { matchesKey } from "./keys.ts";
import { Dialog, type DialogRequest, type Toast, Toasts } from "./Overlays.tsx";
import { onPluginProblem, reportPluginProblem } from "./problems.ts";
import type { ProviderEntry } from "./providers.ts";
import { createProviderStore, type ProviderStore } from "./providers.ts";
import {
  emptyRegistry,
  type HostActions,
  isPositionalId,
  loadPlugins,
  type PluginRuntime,
} from "./registry.ts";
import type {
  Capability,
  CommandInfo,
  ContextUsage,
  DialogOptions,
  NotifyLevel,
  Plugin,
  PluginContext,
  PluginMessage,
  PluginUIContext,
  WidgetOptions,
} from "./tiny.ts";

const newId = () => crypto.randomUUID();

/** Stable, so a narrowed `ctx.chat.messages` does not re-render on every read. */
const EMPTY_MESSAGES: readonly PluginMessage[] = [];

/** Replaces an action a plugin did not ask for, and says so when it is called. */
const withheld =
  (pluginId: string, capability: Capability) =>
  (..._ignored: never[]): void => {
    reportPluginProblem({
      pluginId,
      message: `this needs the "${capability}" capability, which it did not declare`,
    });
  };

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

/** Runs the plugin registry and owns every piece of UI state plugins can drive:
 * dialogs, notifications, widgets and status entries. */
export function PluginHost({
  plugins,
  uiFallbacks,
  children,
}: {
  plugins: readonly Plugin[];
  /** Extra `ctx.ui` members for methods this host cannot implement, e.g. `piTerminalUI` from `@tiny/plugin-pi`. */
  uiFallbacks?: Readonly<Record<string, unknown>> | undefined;
  children: ReactNode;
}) {
  const [registry, setRegistry] = useState<PluginRuntime>(emptyRegistry);
  // A reload leaves this true: the previous registry stays live until the new one lands.
  const [ready, setReady] = useState(false);
  const [dialogs, setDialogs] = useState<readonly DialogRequest[]>([]);
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const [widgets, setWidgets] = useState<ReadonlyMap<string, Widget>>(new Map());
  const [statuses, setStatuses] = useState<ReadonlyMap<string, string>>(new Map());
  const [editorText, setEditorText] = useState("");
  // Mirrored into a ref: `ui` is built once, `getEditorText()` must see the text as it is now.
  const editorTextRef = useRef(editorText);
  editorTextRef.current = editorText;

  // State, not a ref: contributed components must re-render when chat state moves.
  const [bridge, setBridge] = useState<AppBridge>(emptyBridge);
  const resolvers = useRef(new Map<string, (value: unknown) => void>());

  // Bumped by `reload()`, which rebuilds the registry from scratch.
  const [nonce, setNonce] = useState(0);
  const reloading = useRef<(() => void)[]>([]);

  // Declared up here because the load effect reads it before the context is built below.
  const contextForRef = useRef<((pluginId: string) => PluginContext) | undefined>(undefined);

  // Providers and the event bus outlive one load; a bus reset on reload would drop subscriptions.
  const providerStore = useRef<ProviderStore>(undefined);
  providerStore.current ??= createProviderStore();
  const providers = useProviders(providerStore.current);
  const events = useRef(createEvents()).current;
  // Held by the host, not the module: two hosts in one page must not share these.
  const forgetfulStores = useRef<ForgetfulStores>(new Map()).current;

  // `undefined` means "everything the registry has"; `setActiveTools` replaces it with a list.
  const [activeNames, setActiveNames] = useState<readonly string[] | undefined>(undefined);

  // Recorded by the host's own extension, so `ctx.getContextUsage()` needs nothing from the app.
  const usage = useRef<ContextUsage>({ input: 0, output: 0, totalTokens: 0, contextWindow: 0 });

  const usageRecorder = useRef<Extension>((tiny) => {
    tiny.on("message_end", (event, context) => {
      const { input, output, totalTokens } = event.message.usage;
      usage.current = { input, output, totalTokens, contextWindow: context.model.contextWindow };
    });
  }).current;

  // Factories may be async: the app renders immediately, contributions appear when ready.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the reload trigger — the effect re-runs on it rather than reading it
  useEffect(() => {
    let live = true;
    let unsubscribe: (() => void) | undefined;
    const settleReloads = () => {
      for (const done of reloading.current.splice(0)) done();
    };
    // Appended, not registered as a plugin: it must not show up in anything plugins can enumerate.
    const withRecorder = (loaded: PluginRuntime): PluginRuntime => ({
      ...loaded,
      extensions: [...loaded.extensions, usageRecorder],
    });
    loadPlugins(plugins, {
      providers: providerStore.current,
      events,
      host: () => hostActions.current,
      context: (pluginId) => contextForRef.current?.(pluginId),
    }).then(
      (loaded) => {
        if (!live) return;
        setRegistry(withRecorder(loaded));
        // A registration withdrawn later arrives here rather than through a reload.
        unsubscribe = loaded.subscribe((next) => {
          if (live) setRegistry(withRecorder(next));
        });
        setReady(true);
        settleReloads();
      },
      (error: unknown) => {
        reportPluginProblem({ pluginId: undefined, message: "failed to load", error });
        // A failed load still ends the wait and still counts as ready.
        if (!live) return;
        setReady(true);
        settleReloads();
      },
    );
    return () => {
      live = false;
      unsubscribe?.();
    };
  }, [plugins, nonce, events, usageRecorder]);

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

  // One dialog request, resolved by the user, `opts.timeout`, or `opts.signal` — pi's three outcomes.
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

  const toast = useCallback((message: string, type: NotifyLevel) => {
    const id = newId();
    setToasts((current) => [...current, { id, message, type }]);
    setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 4000);
  }, []);

  // In development each report becomes an error toast; production keeps the console line only.
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    return onPluginProblem(({ pluginId, message }) =>
      toast(pluginId === undefined ? message : `${pluginId}: ${message}`, "error"),
    );
  }, [toast]);

  const ui = useMemo<PluginUIContext>(
    () => ({
      // First, so nothing an adapter adds can shadow a method this host really implements.
      ...uiFallbacks,

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
      notify: (message, type = "info") => toast(message, type),
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
      open: <T,>(render: (done: (result: T) => void) => ReactNode, opts?: DialogOptions) =>
        ask<T | undefined>(
          (id) => ({
            kind: "custom",
            id,
            render: (done) => render(done as (result: T) => void),
          }),
          opts,
          undefined,
        ),

      getEditorText: () => editorTextRef.current,
    }),
    [ask, toast, uiFallbacks],
  );

  const commands = useMemo<readonly CommandInfo[]>(
    () =>
      registry.commands.map(({ invocationName, options }) => ({
        name: invocationName,
        description: options.description,
      })),
    [registry],
  );

  const allTools = useMemo(() => registry.tools.map((tool) => tool.name), [registry]);
  const activeTools = useMemo(
    // An unset list means every tool.
    () => (activeNames === undefined ? allTools : allTools.filter((n) => activeNames.includes(n))),
    [allTools, activeNames],
  );

  const contextFor = useCallback(
    (pluginId: string): PluginContext => {
      // Undeclared means everything; declaring narrows `ctx` — see `PluginOptions.needs`.
      const declared = registry.needs.get(pluginId);
      const granted = (capability: Capability) =>
        declared === undefined || declared.includes(capability);

      return {
        ui,
        mode: "react",
        hasUI: true,
        signal: bridge.signal,
        chat: {
          // The actions stay; only reading the conversation is gated.
          messages: granted("chat") ? bridge.messages : EMPTY_MESSAGES,
          streaming: granted("chat") ? bridge.streaming : undefined,
          send: bridge.send,
          stop: bridge.stop,
        },
        settings: granted("settings") ? bridge.settings : undefined,
        updateSettings: granted("settings")
          ? bridge.updateSettings
          : withheld(pluginId, "settings"),
        navigate: bridge.navigate,
        storage: namespacedStorage(pluginId, forgetfulStores),
        runCommand: (name, args) => runCommandRef.current(name, args),
        commands,
        abort: bridge.stop,
        // Nothing is queued here, so pi's two questions have the same answer.
        isIdle: () => bridge.streaming === undefined,
        hasPendingMessages: () => bridge.streaming !== undefined,
        getContextUsage: () => usage.current,
        newSession: () => bridge.navigate("/"),
        reload,
      };
    },
    [ui, commands, bridge, reload, forgetfulStores, registry],
  );

  const runCommand = useCallback(
    async (name: string, args = "") => {
      const entry = registry.commands.find(
        (command) => command.invocationName === name || command.name === name,
      );
      if (entry === undefined) {
        reportPluginProblem({ pluginId: undefined, message: `no such command: ${name}` });
        return;
      }
      // A throwing handler must not take the app down with it.
      try {
        await entry.options.handler(args, contextFor(entry.pluginId));
      } catch (error) {
        reportPluginProblem({
          pluginId: entry.pluginId,
          message: `command "${name}" failed`,
          error,
        });
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
            reportPluginProblem({ pluginId: entry.pluginId, message: "shortcut failed", error });
          }
        })();
        return;
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [registry, contextFor]);

  // Skip the update when nothing moved, or an identical bridge per render would loop forever.
  const publish = useCallback((next: AppBridge) => {
    setBridge((current) => (sameBridge(current, next) ? current : next));
  }, []);

  // Refs because `loadPlugins` captures the getters once, while handlers run much later.
  contextForRef.current = contextFor;

  const hostActions = useRef<HostActions>(undefined as unknown as HostActions);
  hostActions.current = {
    getCommands: () => commands,
    getAllTools: () => allTools,
    getActiveTools: () => activeTools,
    setActiveTools: (names) => setActiveNames([...names]),
    setModel: (model) => {
      if (bridge.settings === undefined) return;
      bridge.updateSettings({ ...bridge.settings, model });
    },
    sendUserMessage: (content) => bridge.send(content),
    getSessionName: () => bridge.sessionName,
    setSessionName: (name) => {
      if (bridge.setSessionName === undefined) {
        reportPluginProblem({
          pluginId: undefined,
          message: "tiny.setSessionName() is not supported by this app",
        });
        return;
      }
      bridge.setSessionName(name);
    },
  };

  const value = useMemo<HostValue>(
    () => ({
      registry,
      ready,
      widgets,
      statuses,
      commands,
      providers,
      activeTools,
      events,
      editorText,
      setEditorText,
      runCommand,
      contextFor,
      publish,
    }),
    [
      registry,
      ready,
      widgets,
      statuses,
      commands,
      providers,
      activeTools,
      events,
      editorText,
      runCommand,
      contextFor,
      publish,
    ],
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

// Subscribes to the provider store — mutable state outside React that may change at any time.
const useProviders = (store: ProviderStore): readonly ProviderEntry[] => {
  const [entries, setEntries] = useState<readonly ProviderEntry[]>(() => store.list());
  useEffect(() => {
    setEntries(store.list());
    return store.subscribe(() => setEntries(store.list()));
  }, [store]);
  return entries;
};

// Field-by-field equality, read off the objects so a new `AppBridge` field cannot be forgotten.
const sameBridge = (a: AppBridge, b: AppBridge): boolean => {
  // Union of both key sets, so an absent optional field and one present as `undefined` compare equal.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof AppBridge>;
  return [...keys].every((key) => Object.is(a[key], b[key]));
};

// Storage for an unidentified plugin: real, but page-lifetime only — persisting under a
// positional id would silently move user data when the list changes.
type Forgetful = { readonly values: Map<string, unknown>; warned: boolean };

/** Where unidentified plugins' values live, for as long as the host does. */
export type ForgetfulStores = Map<string, Forgetful>;

const forgetfulStorage = (pluginId: string, stores: ForgetfulStores) => {
  // Keyed by plugin: contexts are rebuilt per command/event, and the store must survive that.
  const store = stores.get(pluginId) ?? { values: new Map<string, unknown>(), warned: false };
  stores.set(pluginId, store);
  const { values } = store;
  const warnOnce = () => {
    if (store.warned) return;
    store.warned = true;
    console.warn(
      `[plugin] "${pluginId}" declared no id, so its storage lasts only until ` +
        `this page is reloaded — persisting it would namespace the data by the ` +
        `plugin's position in the list, and move it whenever that list changes. ` +
        `Wrap the plugin in definePlugin("<name>", …) to keep what it stores.`,
    );
  };
  return {
    get<T>(key: string): T | undefined {
      warnOnce();
      return values.get(key) as T | undefined;
    },
    set(key: string, value: unknown) {
      warnOnce();
      values.set(key, value);
    },
    remove(key: string) {
      values.delete(key);
    },
  };
};

/** Per-plugin localStorage, so a plugin cannot reach the app's own keys. */
const namespacedStorage = (pluginId: string, forgetful: ForgetfulStores) => {
  if (isPositionalId(pluginId)) return forgetfulStorage(pluginId, forgetful);
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
