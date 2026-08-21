import { type Extension, type ExtensionContext, firesEvent, type ToolDefinition } from "@tiny/ai";
import { createEvents, type PluginEvents } from "./events.ts";
import type { KeyId } from "./keys.ts";
import type { ProviderEntry } from "./providers.ts";
import { createProviderStore, type ProviderStore } from "./providers.ts";
import type { Contribution, SlotName } from "./Slot.tsx";
import { identityTheme } from "./theme.ts";
import type {
  CommandInfo,
  CommandOptions,
  Dispose,
  MarkdownContext,
  MarkdownTransformer,
  PanelOptions,
  PiPluginAPI,
  Plugin,
  PluginContext,
  PluginEventContext,
  PluginUIContext,
  RouteOptions,
  ShortcutOptions,
} from "./tiny.ts";

export type CommandEntry = {
  /** The name as registered. */
  readonly name: string;
  /** How it is invoked — `name`, or `name:1` when several plugins claim it. */
  readonly invocationName: string;
  readonly pluginId: string;
  readonly options: CommandOptions;
};

export type ShortcutEntry = {
  readonly shortcut: KeyId;
  readonly pluginId: string;
  readonly options: ShortcutOptions;
};

export type ContributionEntry = {
  /** Stable across renders — assigned once, when the factories run. */
  readonly id: string;
  readonly slot: SlotName;
  readonly pluginId: string;
  readonly component: Contribution;
};

export type PanelEntry = {
  /** `<pluginId>:<panelId>` — unique across plugins that pick the same id. */
  readonly id: string;
  /** The id as the plugin registered it. */
  readonly panelId: string;
  readonly pluginId: string;
  readonly options: PanelOptions;
};

export type RouteEntry = {
  /** The address the router matches. Always starts with `/`. */
  readonly path: string;
  readonly pluginId: string;
  readonly options: RouteOptions;
};

export type ToolEntry = {
  readonly pluginId: string;
  readonly tool: ToolDefinition;
};

export type MarkdownEntry = {
  readonly pluginId: string;
  readonly transformer: MarkdownTransformer;
};

export type Registry = {
  readonly commands: readonly CommandEntry[];
  readonly shortcuts: readonly ShortcutEntry[];
  readonly contributions: readonly ContributionEntry[];
  /** Right-rail panels, in registration order — the rail's tab order. */
  readonly panels: readonly PanelEntry[];
  /** Pages, in registration order; a path claimed twice keeps the first. */
  readonly routes: readonly RouteEntry[];
  /** Flattened for `streamChat`; a name registered twice keeps the first. */
  readonly tools: readonly ToolDefinition[];
  readonly toolEntries: readonly ToolEntry[];
  /** Run in registration order, each seeing the previous one's output — as in pi. */
  readonly markdown: readonly MarkdownEntry[];
  /** A snapshot; providers also live in a store, since pi allows late registration. */
  readonly providers: readonly ProviderEntry[];
  /** One `@tiny/ai` extension replaying every `on()` call, in registration order. */
  readonly extensions: readonly Extension[];
};

/**
 * A registry that can still change, which is what `loadPlugins` returns.
 *
 * It *is* a `Registry` — every field is the snapshot taken when it was made — so
 * anything reading `registry.commands` is unaffected. What it adds is the two
 * operations a snapshot cannot express: retiring one plugin, and hearing that
 * something was retired.
 *
 * Before this, the only way to remove anything was `ctx.reload()`, which re-runs
 * every factory in the app to take one plugin out. Registrations hand back a
 * disposer now, so a plugin can withdraw a command it no longer applies to, and
 * a host can disable one plugin without disturbing its neighbours.
 */
export type PluginRuntime = Registry & {
  /**
   * Retire everything one plugin registered, including its providers.
   * Returns whether there was anything to retire.
   */
  readonly dispose: (pluginId: string) => boolean;
  /** Called with a fresh snapshot whenever a registration is added or withdrawn. */
  readonly subscribe: (listener: (next: PluginRuntime) => void) => () => void;
};

const noRuntime = {
  dispose: () => false,
  subscribe: () => () => {},
};

export const emptyRegistry: PluginRuntime = {
  commands: [],
  shortcuts: [],
  contributions: [],
  panels: [],
  routes: [],
  tools: [],
  toolEntries: [],
  markdown: [],
  providers: [],
  extensions: [],
  ...noRuntime,
};

/**
 * Applies every registered transformer in order, each seeing the previous
 * one's output. pi keeps the markdown produced so far when a transformer
 * throws and continues with the next, which is what makes the chain safe to
 * run on every streamed frame.
 */
export const transformMarkdown = (
  entries: readonly MarkdownEntry[],
  markdown: string,
  context: MarkdownContext,
): string => {
  let current = markdown;
  for (const { pluginId, transformer } of entries) {
    try {
      current = transformer(current, context);
    } catch (error) {
      console.error(`[plugin:${pluginId}] markdown transformer failed`, error);
    }
  }
  return current;
};

/** Whether an id was derived from list position rather than declared. */
export const isPositionalId = (id: string): boolean => /^plugin-\d+$/.test(id);

/**
 * Characters that must not reach a route pattern.
 *
 * A router compiles the path into a regular expression and escapes the regex
 * metacharacters — all except `?`, which survives as an optionality quantifier.
 * So `/note?s` would match `/notes`, claiming an address that was never
 * registered and that another plugin may own. `#` and whitespace never appear
 * in a pathname either, and in a path are far likelier to be a typo than intent.
 */
const UNUSABLE_IN_PATH = /[?#\s]/;

/**
 * The path as it will be stored and routed on, or `undefined` if unusable.
 *
 * Collapsed and trailing-slash-trimmed because those spellings are *not* inert:
 * `/notes/` scores higher than `/notes` in a router's ranking, so registering
 * the slashed spelling of a path someone else owns silently outranks them —
 * including the app's own. Canonicalising on the way in is what makes the clash
 * check below able to see such a pair as the one address it really is.
 */
const canonicalPath = (path: string): string | undefined => {
  if (!path.startsWith("/") || UNUSABLE_IN_PATH.test(path)) return undefined;
  const collapsed = path.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return collapsed === "" ? "/" : collapsed;
};

/**
 * What two canonical paths have to share to be a clash.
 *
 * Route matching is case-insensitive by default, so `/Notes` and `/notes` are
 * one address however differently they are spelled. Only the comparison is
 * lower-cased — the stored path keeps its case, because a path may carry
 * `:paramName`s whose casing the page reads back.
 */
const addressOf = (path: string): string => path.toLowerCase();

/**
 * A plugin's identity — the namespace for its `ctx.storage` and the label on
 * its errors, so it has to be the same in every build.
 *
 * Deliberately not `plugin.name`: minifiers erase function names, so that would
 * differ between `bun run dev` and `bun run build` and move the user's stored
 * data on release. `definePlugin` is how a plugin says who it is; a plugin that
 * does not is identified by position, and warns the first time it uses storage,
 * which is the only moment the difference can cost anything.
 */
const pluginId = (plugin: Plugin, index: number): string =>
  plugin.id !== undefined && plugin.id !== "" ? plugin.id : `plugin-${index}`;

/**
 * pi keeps every registration of a duplicated command name and disambiguates
 * with numeric suffixes in load order (`/review:1`, `/review:2`); a name claimed
 * once is invoked unsuffixed.
 */
const withInvocationNames = (
  registered: readonly Omit<CommandEntry, "invocationName">[],
): readonly CommandEntry[] => {
  const counts = new Map<string, number>();
  for (const { name } of registered) counts.set(name, (counts.get(name) ?? 0) + 1);

  const seen = new Map<string, number>();
  return registered.map((entry) => {
    if ((counts.get(entry.name) ?? 0) < 2) return { ...entry, invocationName: entry.name };
    const nth = (seen.get(entry.name) ?? 0) + 1;
    seen.set(entry.name, nth);
    return { ...entry, invocationName: `${entry.name}:${nth}` };
  });
};

/**
 * The host actions `tiny.*` methods reach through.
 *
 * `loadPlugins` runs before the app has published any state, and pi allows
 * these to be called long after the factory returns — from a command handler,
 * or an event. So they are resolved at call time through a getter rather than
 * captured when the factory runs.
 */
export type HostActions = {
  getCommands(): readonly CommandInfo[];
  getAllTools(): readonly string[];
  getActiveTools(): readonly string[];
  setActiveTools(names: readonly string[]): void;
  setModel(model: string): void;
  sendUserMessage(content: string): void;
  getSessionName(): string | undefined;
  setSessionName(name: string): void;
};

/**
 * pi's documented RPC fallbacks for the terminal-only half of `ctx.ui`: present,
 * never throwing, returning what an extension would get over RPC.
 */
export const terminalFallbacks = {
  theme: identityTheme,
  custom: async () => undefined,
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
};

/** What a host that has not published anything yet can honestly do: nothing. */
const detachedHost = (): HostActions => {
  const unavailable = (method: string) => () => {
    console.error(`[plugin] tiny.${method}() needs a mounted PluginHost`);
  };
  return {
    getCommands: () => [],
    getAllTools: () => [],
    getActiveTools: () => [],
    setActiveTools: unavailable("setActiveTools"),
    setModel: unavailable("setModel"),
    sendUserMessage: unavailable("sendUserMessage"),
    getSessionName: () => undefined,
    setSessionName: unavailable("setSessionName"),
  };
};

/**
 * The context an event handler gets when no host is mounted.
 *
 * pi runs extensions in print and JSON modes too, where every `ctx.ui` method
 * exists but nothing can be asked of the user; handlers are expected to notice
 * via `ctx.hasUI` and decide for themselves. This is that mode. Dialogs resolve
 * to pi's dismissal values rather than throwing, so a permission gate written
 * for pi fails closed here instead of crashing.
 */
const detachedContext = (): Omit<PluginContext, "hasUI"> & { readonly hasUI: false } => {
  const memory = new Map<string, unknown>();
  const ui: PluginUIContext = {
    select: async () => undefined,
    confirm: async () => false,
    input: async () => undefined,
    editor: async () => undefined,
    open: async () => undefined,
    notify: () => {},
    setStatus: () => {},
    setWidget: () => {},
    setTitle: () => {},
    setEditorText: () => {},
    pasteToEditor: () => {},
    // No host means no composer, so there is no draft to read. The mounted
    // host overrides this with the real one.
    getEditorText: () => "",
    ...terminalFallbacks,
  };
  return {
    ui,
    mode: "react",
    hasUI: false,
    signal: undefined,
    chat: { messages: [], streaming: undefined, send: () => {}, stop: () => {} },
    settings: undefined,
    updateSettings: () => {},
    navigate: () => {},
    storage: {
      get: <T>(key: string) => memory.get(key) as T | undefined,
      set: (key, value) => void memory.set(key, value),
      remove: (key) => void memory.delete(key),
    },
    runCommand: async () => {},
    commands: [],
    abort: () => {},
    isIdle: () => true,
    hasPendingMessages: () => false,
    getContextUsage: () => ({ input: 0, output: 0, totalTokens: 0, contextWindow: 0 }),
    newSession: () => {},
    reload: async () => {},
  };
};

export type LoadOptions = {
  /** Providers outlive one load, because pi allows registering after the factory. */
  readonly providers?: ProviderStore | undefined;
  /** The bus behind `tiny.events`; one per host so plugins can reach each other. */
  readonly events?: PluginEvents | undefined;
  /** Resolved per call, so a handler running later sees the live host. */
  readonly host?: (() => HostActions) | undefined;
  /**
   * The plugin context to widen event handlers with, so `ctx.ui` reaches them
   * as it does in pi. Resolved per call for the same reason as `host`, and
   * allowed to return nothing while the host is still mounting.
   */
  readonly context?: ((pluginId: string) => PluginContext | undefined) | undefined;
};

/**
 * Run every plugin factory once, collecting what each registers.
 *
 * `@tiny/ai` builds its own `ExtensionAPI` inside `loadExtensions`, so it can
 * never be handed this richer object. It does not need to be: the `on()` calls
 * are recorded here and replayed into whatever API `streamChat` constructs, so
 * `@tiny/ai` needs no change to carry plugin event handlers.
 */
export const loadPlugins = async (
  plugins: readonly Plugin[],
  options: LoadOptions = {},
): Promise<PluginRuntime> => {
  type Recorded = { readonly pluginId: string; readonly event: string; readonly handler: unknown };
  const recorded: Recorded[] = [];
  const commands: Omit<CommandEntry, "invocationName">[] = [];
  const shortcuts: ShortcutEntry[] = [];
  const contributions: ContributionEntry[] = [];
  const panels: PanelEntry[] = [];
  const routes: RouteEntry[] = [];
  const toolEntries: ToolEntry[] = [];
  const markdown: MarkdownEntry[] = [];

  const listeners = new Set<(next: PluginRuntime) => void>();
  /** False until the first snapshot exists, so clashes are reported once. */
  let built = false;
  /**
   * Announce a change, once the lists already reflect it.
   *
   * Iterated over a copy for the same reason `events.ts` does: a listener that
   * unsubscribes itself must not disturb the dispatch it is in.
   */
  const notify = () => {
    if (listeners.size === 0) return;
    const next = runtime();
    for (const listener of [...listeners]) listener(next);
  };

  /**
   * Records one registration and hands back the disposer that undoes it.
   *
   * Both halves announce themselves. pi allows registering long after the
   * factory returns — from a command handler, or from a plugin the user just
   * installed — and a command that appears in the registry but not in the
   * command palette is not registered as far as the user is concerned. During
   * the load itself there is nobody subscribed yet, so this costs nothing.
   */
  const record = <T>(list: T[], entry: T): Dispose => {
    list.push(entry);
    notify();
    return () => {
      const at = list.indexOf(entry);
      // Already withdrawn — by a second call, or by `dispose` sweeping the
      // plugin — so there is nothing to announce.
      if (at === -1) return;
      list.splice(at, 1);
      notify();
    };
  };

  const providers = options.providers ?? createProviderStore();
  const events = options.events ?? createEvents();
  const host = options.host ?? detachedHost;
  const context = options.context ?? (() => undefined);
  // A reload re-runs every factory, so provider registrations must not stack up
  // on top of the previous load's.
  providers.reset();

  for (const [index, plugin] of plugins.entries()) {
    const id = pluginId(plugin, index);
    let contributed = 0;
    // Annotated, not asserted. `as PluginAPI` over the whole literal would only
    // check what is here against the interface, never that all of it is here —
    // so a method added to `PluginAPI` and forgotten below would compile, and
    // surface as `tiny.<method> is not a function` when a plugin first calls it,
    // swallowed by the host's load handler into one console line. The cast is
    // therefore narrowed to the single property that needs it.
    const api: PiPluginAPI = {
      // `on` alone: its overloads cannot be satisfied by one implementation
      // signature, and the recorder is deliberately untyped so pi events this
      // host never fires are stored just the same.
      on: ((event: string, handler: unknown) => {
        return record(recorded, { pluginId: id, event, handler });
      }) as PiPluginAPI["on"],
      registerCommand: (name, options) => {
        return record(commands, { name, pluginId: id, options });
      },
      registerShortcut: (shortcut, options) => {
        return record(shortcuts, { shortcut, pluginId: id, options });
      },
      registerTool: (tool) => {
        return record(toolEntries, { pluginId: id, tool });
      },
      registerMarkdownTransformer: (transformer) => {
        return record(markdown, { pluginId: id, transformer });
      },
      registerProvider: (providerId, config) => providers.register(id, providerId, config),
      unregisterProvider: (providerId) => providers.unregister(providerId),
      getCommands: () => host().getCommands(),
      getAllTools: () => host().getAllTools(),
      getActiveTools: () => host().getActiveTools(),
      setActiveTools: (names) => host().setActiveTools(names),
      setModel: (model) => host().setModel(model),
      sendUserMessage: (content) => host().sendUserMessage(content),
      getSessionName: () => host().getSessionName(),
      setSessionName: (name) => host().setSessionName(name),
      events,
      contribute: (slot, component) => {
        // Counted per plugin, not across all of them: the id is a React key, so
        // it has to stay stable when a neighbouring plugin is retired.
        return record(contributions, {
          id: `${id}#${contributed++}`,
          slot,
          pluginId: id,
          component,
        });
      },
      registerPanel: (panelId, options) => {
        // Namespaced, so two plugins may both call their panel "notes"; only a
        // plugin colliding with itself is a mistake worth reporting.
        const key = `${id}:${panelId}`;
        if (panels.some((panel) => panel.id === key)) {
          console.error(`[plugin:${id}] panel "${panelId}" is already registered`);
          return () => {};
        }
        return record(panels, { id: key, panelId, pluginId: id, options });
      },
      registerRoute: (declared, options) => {
        const path = canonicalPath(declared);
        if (path === undefined) {
          console.error(
            `[plugin:${id}] route "${declared}" is not a usable path — it must start ` +
              `with "/" and contain no "?", "#" or whitespace`,
          );
          return () => {};
        }
        // A path is an address, not a name: it cannot be suffixed the way a
        // duplicate command is, so a clash has to be reported instead. Compared
        // as a router matches, not as a string — see `addressOf`.
        if (routes.some((route) => addressOf(route.path) === addressOf(path))) {
          console.error(`[plugin:${id}] route "${declared}" is already registered`);
          return () => {};
        }
        return record(routes, { path, pluginId: id, options });
      },
    };
    await plugin(api);
  }

  // Built at most once per load, so a plugin running without a host still gets
  // storage that survives between events rather than a fresh empty one each time.
  let detached: ReturnType<typeof detachedContext> | undefined;
  const fallbackContext = () => (detached ??= detachedContext());

  // Replay is idempotent: `loadExtensions` builds fresh handler arrays per call.
  // It reads `recorded` when it runs rather than closing over a copy, so a
  // handler withdrawn between requests is simply not registered on the next one.
  const replay: Extension = (tiny) => {
    for (const { pluginId: owner, event, handler } of recorded) {
      // Events this facade never fires are dropped rather than registered, so a
      // pi extension subscribing to `session_start` loads without erroring.
      if (!firesEvent(event)) continue;
      const on = tiny.on as (event: string, handler: unknown) => void;
      const run = handler as (event: unknown, ctx: PluginEventContext) => unknown;
      // `@tiny/ai` can only supply `{ model, signal }`; pi hands handlers the
      // same context its commands get. The request's own half wins, so `model`
      // and `signal` always describe the call in flight.
      on(event, (fired: unknown, ctx: ExtensionContext) =>
        run(fired, { ...(context(owner) ?? fallbackContext()), ...ctx }),
      );
    }
  };

  /**
   * The tools the model may address, deduplicated.
   *
   * A tool name has to be unique for the model to address it, so unlike commands
   * a duplicate cannot be suffixed — the first registration wins and the clash is
   * reported. Recomputed per snapshot rather than once: when the plugin holding
   * the winning `fs_read` is retired, the runner-up should get the name.
   */
  const activeTools = (report: boolean): ToolDefinition[] => {
    const tools: ToolDefinition[] = [];
    for (const { pluginId: owner, tool } of toolEntries) {
      if (!tools.some((existing) => existing.name === tool.name)) tools.push(tool);
      else if (report) console.error(`[plugin:${owner}] tool "${tool.name}" is already registered`);
    }
    return tools;
  };

  /** Everything one plugin put in, taken back out in one step. */
  const dispose = (owner: string): boolean => {
    const owned = <T extends { readonly pluginId: string }>(list: T[]) => {
      const kept = list.filter((entry) => entry.pluginId !== owner);
      const removed = kept.length !== list.length;
      list.splice(0, list.length, ...kept);
      return removed;
    };
    const removed = [recorded, commands, shortcuts, contributions, panels, routes, toolEntries]
      // `.map` before `.some`: every list must be swept, not just those up to
      // the first that had something in it.
      .map((list) => owned(list as { readonly pluginId: string }[]))
      .includes(true);
    const sweptMarkdown = owned(markdown);
    // Providers live in a store of their own, since pi allows late registration.
    const sweptProviders = providers.removeOwner(owner);
    const any = removed || sweptMarkdown || sweptProviders;
    if (any) notify();
    return any;
  };

  const runtime = (): PluginRuntime => ({
    commands: withInvocationNames(commands),
    shortcuts: [...shortcuts],
    contributions: [...contributions],
    panels: [...panels],
    routes: [...routes],
    // Only the first build reports clashes; a rebuild after a disposal would
    // otherwise repeat every warning the load already printed.
    tools: activeTools(!built),
    toolEntries: [...toolEntries],
    markdown: [...markdown],
    providers: providers.list(),
    extensions: recorded.length > 0 ? [replay] : [],
    dispose,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
  });

  const first = runtime();
  built = true;
  return first;
};
