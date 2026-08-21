import type { Extension } from "@tiny/ai";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createEvents } from "./events.ts";
import { type AppBridge, HostContext, type HostValue, type Widget } from "./hooks.ts";
import { matchesKey } from "./keys.ts";
import { Dialog, type DialogRequest, type Toast, Toasts } from "./Overlays.tsx";
import type { ProviderEntry } from "./providers.ts";
import { createProviderStore, type ProviderStore } from "./providers.ts";
import {
  emptyRegistry,
  type HostActions,
  isPositionalId,
  loadPlugins,
  type Registry,
  terminalFallbacks,
} from "./registry.ts";
import type {
  CommandInfo,
  ContextUsage,
  DialogOptions,
  Plugin,
  PluginContext,
  PluginUIContext,
  WidgetOptions,
} from "./tiny.ts";

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
  // Whether the factories have run at all. A reload leaves this true: the
  // previous registry stays live until the new one lands, so there is no moment
  // where the app has to pretend it knows nothing.
  const [ready, setReady] = useState(false);
  const [dialogs, setDialogs] = useState<readonly DialogRequest[]>([]);
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const [widgets, setWidgets] = useState<ReadonlyMap<string, Widget>>(new Map());
  const [statuses, setStatuses] = useState<ReadonlyMap<string, string>>(new Map());
  const [editorText, setEditorText] = useState("");
  // The composer is controlled by this state, so it is what the user typed as
  // well as what a plugin pushed. Mirrored into a ref because `ui` is built once
  // and `getEditorText()` must still see the text as it is now.
  const editorTextRef = useRef(editorText);
  editorTextRef.current = editorText;

  // State, not a ref: contributed components read chat state through the
  // context and must re-render when it moves.
  const [bridge, setBridge] = useState<AppBridge>(emptyBridge);
  const resolvers = useRef(new Map<string, (value: unknown) => void>());

  // Bumped by `reload()`. The registry is rebuilt from scratch on every load,
  // so a plugin dropped from the list also loses its commands, tools, slots and
  // event handlers — there is no separate unregister path to keep in step.
  const [nonce, setNonce] = useState(0);
  const reloading = useRef<(() => void)[]>([]);

  // Declared up here because the load effect below reads it, while the context
  // it holds is only built further down.
  const contextForRef = useRef<((pluginId: string) => PluginContext) | undefined>(undefined);

  // Providers and the event bus outlive one load: pi allows `registerProvider`
  // long after the factory returns, and a bus that reset on reload would drop
  // subscriptions mid-conversation.
  const providerStore = useRef<ProviderStore>(undefined);
  providerStore.current ??= createProviderStore();
  const providers = useProviders(providerStore.current);
  const events = useRef(createEvents()).current;
  // Held by the host, not the module: two hosts in one page — which is every
  // test file — must not read each other's unidentified plugins' values.
  const forgetfulStores = useRef<ForgetfulStores>(new Map()).current;

  // `undefined` means "everything the registry has"; pi's `setActiveTools`
  // replaces that with an explicit list.
  const [activeNames, setActiveNames] = useState<readonly string[] | undefined>(undefined);

  // Recorded by an extension this host adds itself, so `ctx.getContextUsage()`
  // works without the app having to track or publish token counts.
  const usage = useRef<ContextUsage>({ input: 0, output: 0, totalTokens: 0, contextWindow: 0 });

  // pi's `ctx.getContextUsage()` reads the harness's own accounting. This host
  // has none of its own, so it subscribes like any other extension — which also
  // means the app needs no change to support it.
  const usageRecorder = useRef<Extension>((tiny) => {
    tiny.on("message_end", (event, context) => {
      const { input, output, totalTokens } = event.message.usage;
      usage.current = { input, output, totalTokens, contextWindow: context.model.contextWindow };
    });
  }).current;

  // Factories may be async, so the registry arrives after first paint; the app
  // renders immediately and contributions appear when they are ready.
  // biome-ignore lint/correctness/useExhaustiveDependencies: `nonce` is the reload trigger — the effect re-runs on it rather than reading it
  useEffect(() => {
    let live = true;
    const settleReloads = () => {
      for (const done of reloading.current.splice(0)) done();
    };
    loadPlugins(plugins, {
      providers: providerStore.current,
      events,
      host: () => hostActions.current,
      context: (pluginId) => contextForRef.current?.(pluginId),
    }).then(
      (loaded) => {
        if (!live) return;
        // Appended rather than registered as a plugin: it is the host's own
        // bookkeeping, and must not show up in anything plugins can enumerate.
        setRegistry({ ...loaded, extensions: [...loaded.extensions, usageRecorder] });
        setReady(true);
        settleReloads();
      },
      (error: unknown) => {
        console.error("[plugin] failed to load", error);
        // A failed load still ends the wait — `reload()` promises that the
        // attempt is over, not that it succeeded — and still counts as ready,
        // or the app would wait forever on plugins that are never coming.
        if (!live) return;
        setReady(true);
        settleReloads();
      },
    );
    return () => {
      live = false;
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

      /* — terminal-only: pi's documented RPC fallbacks — */
      ...terminalFallbacks,

      // Not a fallback: this host owns the composer's text —
      // `PromptBar` is controlled by `editorText` — so a plugin reading the
      // draft gets the draft, including what the user typed by hand.
      getEditorText: () => editorTextRef.current,
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

  const allTools = useMemo(() => registry.tools.map((tool) => tool.name), [registry]);
  const activeTools = useMemo(
    // An unset list means every tool, so a plugin that never calls
    // `setActiveTools` sees exactly what it registered.
    () => (activeNames === undefined ? allTools : allTools.filter((n) => activeNames.includes(n))),
    [allTools, activeNames],
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
      storage: namespacedStorage(pluginId, forgetfulStores),
      runCommand: (name, args) => runCommandRef.current(name, args),
      commands,
      abort: bridge.stop,
      // Nothing is queued here — a reply is either streaming or it is not — so
      // pi's two questions have the same answer, from opposite directions.
      isIdle: () => bridge.streaming === undefined,
      hasPendingMessages: () => bridge.streaming !== undefined,
      getContextUsage: () => usage.current,
      newSession: () => bridge.navigate("/"),
      reload,
    }),
    [ui, commands, bridge, reload, forgetfulStores],
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

  // Same reason as `hostActions`: `loadPlugins` captures the getter once, but an
  // event handler runs much later and must see the context of that moment. It
  // is unset only until the first render finishes, before any plugin can fire.
  contextForRef.current = contextFor;

  // Read through a ref because `loadPlugins` captures the getter once, while a
  // `tiny.*` method may be called from a handler running long afterwards.
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
        console.error("[plugin] tiny.setSessionName() is not supported by this app");
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

/**
 * Subscribes to the provider store, which is mutable state outside React —
 * `tiny.registerProvider` may be called from a command handler at any time, so the
 * host cannot read it once and hold the result.
 */
const useProviders = (store: ProviderStore): readonly ProviderEntry[] => {
  const [entries, setEntries] = useState<readonly ProviderEntry[]>(() => store.list());
  useEffect(() => {
    setEntries(store.list());
    return store.subscribe(() => setEntries(store.list()));
  }, [store]);
  return entries;
};

/**
 * Whether two bridges hold the same values, field by field.
 *
 * Read off the objects rather than from a list of field names: a list would have
 * to be updated by hand every time `AppBridge` gains a field, and — because
 * `satisfies readonly (keyof AppBridge)[]` accepts a list that is merely valid,
 * not complete — forgetting would compile clean and silently stop republishing
 * that field to plugins.
 */
const sameBridge = (a: AppBridge, b: AppBridge): boolean => {
  // The union of both key sets, so an absent optional field and one present as
  // `undefined` still compare equal — an app that only sometimes spreads
  // `sessionName` in must not re-publish on every render because of it.
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof AppBridge>;
  return [...keys].every((key) => Object.is(a[key], b[key]));
};

/**
 * Storage for a plugin that never said who it is: real, but only for this page.
 *
 * The alternative was persisting under the plugin's position in the list, which
 * reads fine until someone inserts a plugin above it and every user's data moves
 * to a namespace nothing looks in. That failure is silent, permanent, and
 * discovered by the user rather than the author, so an unidentified plugin gets
 * a store that works and forgets instead of one that persists and lies.
 *
 * Declaring an id with `definePlugin` is the whole fix, and the warning says so.
 */
type Forgetful = { readonly values: Map<string, unknown>; warned: boolean };

/** Where unidentified plugins' values live, for as long as the host does. */
export type ForgetfulStores = Map<string, Forgetful>;

const forgetfulStorage = (pluginId: string, stores: ForgetfulStores) => {
  // Keyed by plugin rather than built per context: a context is rebuilt for
  // every command and every event, and a store that started empty each time
  // would not be storage at all.
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
