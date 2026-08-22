import { type Extension, type ExtensionContext, firesEvent, type ToolDefinition } from "@tiny/ai";
import { createEvents, type PluginEvents } from "./events.ts";
import type { KeyId } from "./keys.ts";
import { reportPluginProblem } from "./problems.ts";
import type { ProviderEntry } from "./providers.ts";
import { createProviderStore, type ProviderStore } from "./providers.ts";
import type { Contribution, SlotName } from "./Slot.tsx";
import type {
  Capability,
  CommandInfo,
  CommandOptions,
  Dispose,
  MarkdownContext,
  MarkdownTransformer,
  PanelOptions,
  Plugin,
  PluginAPI,
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
  /** What each plugin that declared `needs` asked for, by id; absent means narrowed by nothing. */
  readonly needs: ReadonlyMap<string, readonly Capability[]>;
};

/** A registry that can still change — what `loadPlugins` returns: a `Registry` snapshot
 * plus retiring one plugin and hearing about changes. */
export type PluginRuntime = Registry & {
  /** Retire everything one plugin registered, including its providers; returns whether anything was retired. */
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
  needs: new Map(),
  ...noRuntime,
};

/** Applies every registered transformer in order; a throwing transformer keeps the markdown so far, as in pi. */
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
      reportPluginProblem({ pluginId, message: "markdown transformer failed", error });
    }
  }
  return current;
};

/** Whether an id was derived from list position rather than declared. */
export const isPositionalId = (id: string): boolean => /^plugin-\d+$/.test(id);

// `?` survives router regex-escaping as an optionality quantifier, so `/note?s` would match `/notes`.
const UNUSABLE_IN_PATH = /[?#\s]/;

// Canonicalised because `/notes/` outranks `/notes` in router scoring; returns undefined if unusable.
const canonicalPath = (path: string): string | undefined => {
  if (!path.startsWith("/") || UNUSABLE_IN_PATH.test(path)) return undefined;
  const collapsed = path.replace(/\/{2,}/g, "/").replace(/\/+$/, "");
  return collapsed === "" ? "/" : collapsed;
};

// Routing is case-insensitive; only the comparison is lower-cased, since `:paramName` casing matters.
const addressOf = (path: string): string => path.toLowerCase();

// Not `plugin.name`: minifiers erase function names, which would move stored data between builds.
const pluginId = (plugin: Plugin, index: number): string =>
  plugin.id !== undefined && plugin.id !== "" ? plugin.id : `plugin-${index}`;

/** A plugin and the identity the list it was written in gave it. */
type Loading = { readonly plugin: Plugin; readonly id: string };

// Load order: repeatedly take the earliest-listed plugin whose prerequisites have run.
// Constraints naming uninstalled plugins are dropped; a cycle is reported and falls back to list order.
const inLoadOrder = (entries: readonly Loading[]): readonly Loading[] => {
  const plugins = entries.map((entry) => entry.plugin);
  if (!plugins.some((plugin) => plugin.after !== undefined || plugin.before !== undefined))
    return entries;

  // Ids come from the list as written, before any of this reorders it.
  const positionOf = new Map(entries.map((entry, index) => [entry.id, index]));
  // `edges[i]` holds the plugins that must wait for `i`.
  const edges: Set<number>[] = plugins.map(() => new Set());
  const waitingOn = plugins.map(() => 0);

  const link = (before: number, afterwards: number) => {
    if (before === afterwards || edges[before]?.has(afterwards) === true) return;
    edges[before]?.add(afterwards);
    waitingOn[afterwards] = (waitingOn[afterwards] ?? 0) + 1;
  };

  /** Every plugin `names` refers to — `"*"` meaning all of the others. */
  const targets = (names: readonly string[], self: number): number[] =>
    names.includes("*")
      ? plugins.map((_, index) => index).filter((index) => index !== self)
      : names.flatMap((name) => {
          const found = positionOf.get(name);
          return found === undefined ? [] : [found];
        });

  plugins.forEach((plugin, index) => {
    for (const other of targets(plugin.after ?? [], index)) link(other, index);
    for (const other of targets(plugin.before ?? [], index)) link(index, other);
  });

  const order: Loading[] = [];
  const placed = plugins.map(() => false);
  while (order.length < entries.length) {
    // Scanned in list order rather than a queue: that is what keeps the sort stable.
    const next = plugins.findIndex((_, index) => !placed[index] && waitingOn[index] === 0);
    if (next === -1) {
      const stuck = entries.filter((_, index) => !placed[index]).map((entry) => entry.id);
      reportPluginProblem({
        pluginId: undefined,
        message: `circular load order between ${stuck.join(", ")} — loading them as listed`,
      });
      for (const [index, entry] of entries.entries()) if (!placed[index]) order.push(entry);
      break;
    }
    placed[next] = true;
    const entry = entries[next];
    if (entry !== undefined) order.push(entry);
    for (const dependent of edges[next] ?? [])
      waitingOn[dependent] = (waitingOn[dependent] ?? 1) - 1;
  }
  return order;
};

// Duplicated command names get numeric suffixes in load order (`/review:1`), as in pi.
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

/** The host actions `tiny.*` methods reach through — resolved at call time, not captured at load. */
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

/** What a host that has not published anything yet can honestly do: nothing. */
const detachedHost = (): HostActions => {
  const unavailable = (method: string) => () => {
    reportPluginProblem({
      pluginId: undefined,
      message: `tiny.${method}() needs a mounted PluginHost`,
    });
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

// The hostless context: dialogs resolve to pi's dismissal values, so permission gates fail closed.
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
    getEditorText: () => "",
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
  /** The plugin context to widen event handlers with; resolved per call, may be absent while mounting. */
  readonly context?: ((pluginId: string) => PluginContext | undefined) | undefined;
};

/** Run every plugin factory once, collecting what each registers.
 * `on()` calls are recorded and replayed into whatever API `streamChat` constructs. */
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

  /** What each plugin declared, for the host to narrow its context with. */
  const needs = new Map<string, readonly Capability[]>();
  const listeners = new Set<(next: PluginRuntime) => void>();
  /** False until the first snapshot exists, so clashes are reported once. */
  let built = false;
  // Iterated over a copy: a listener that unsubscribes itself must not disturb the dispatch.
  const notify = () => {
    if (listeners.size === 0) return;
    const next = runtime();
    for (const listener of [...listeners]) listener(next);
  };

  // Records one registration and hands back the disposer that undoes it; both halves notify.
  const record = <T>(list: T[], entry: T): Dispose => {
    list.push(entry);
    notify();
    return () => {
      const at = list.indexOf(entry);
      if (at === -1) return;
      list.splice(at, 1);
      notify();
    };
  };

  const providers = options.providers ?? createProviderStore();
  const events = options.events ?? createEvents();
  const host = options.host ?? detachedHost;
  const context = options.context ?? (() => undefined);
  // A reload re-runs every factory, so provider registrations must not stack up.
  providers.reset();

  for (const { plugin, id } of inLoadOrder(
    plugins.map((plugin, index) => ({ plugin, id: pluginId(plugin, index) })),
  )) {
    let contributed = 0;
    // Undeclared means everything, as it always did; declaring narrows.
    const granted = (capability: Capability) =>
      plugin.needs === undefined || plugin.needs.includes(capability);
    if (plugin.needs !== undefined) needs.set(id, plugin.needs);
    // Annotated, not asserted: `as PluginAPI` over the literal would not catch a missing method.
    const api: PluginAPI = {
      // `on` alone is cast: its overloads cannot be satisfied by one implementation signature.
      on: ((event: string, handler: unknown) => {
        return record(recorded, { pluginId: id, event, handler });
      }) as PluginAPI["on"],
      registerCommand: (name, options) => {
        return record(commands, { name, pluginId: id, options });
      },
      registerShortcut: (shortcut, options) => {
        return record(shortcuts, { shortcut, pluginId: id, options });
      },
      registerTool: (tool) => {
        if (!granted("tools")) {
          reportPluginProblem({
            pluginId: id,
            message:
              `registerTool("${tool.name}") needs the "tools" capability, ` +
              `which this plugin did not declare`,
          });
          return () => {};
        }
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
        // Counted per plugin: the id is a React key, stable when a neighbouring plugin is retired.
        return record(contributions, {
          id: `${id}#${contributed++}`,
          slot,
          pluginId: id,
          component,
        });
      },
      registerPanel: (panelId, options) => {
        // Namespaced, so only a plugin colliding with itself is reported.
        const key = `${id}:${panelId}`;
        if (panels.some((panel) => panel.id === key)) {
          reportPluginProblem({
            pluginId: id,
            message: `panel "${panelId}" is already registered`,
          });
          return () => {};
        }
        return record(panels, { id: key, panelId, pluginId: id, options });
      },
      registerRoute: (declared, options) => {
        const path = canonicalPath(declared);
        if (path === undefined) {
          reportPluginProblem({
            pluginId: id,
            message:
              `route "${declared}" is not a usable path — it must start ` +
              `with "/" and contain no "?", "#" or whitespace`,
          });
          return () => {};
        }
        // A path cannot be suffixed like a duplicate command; compared as a router matches — see `addressOf`.
        if (routes.some((route) => addressOf(route.path) === addressOf(path))) {
          reportPluginProblem({
            pluginId: id,
            message: `route "${declared}" is already registered`,
          });
          return () => {};
        }
        return record(routes, { path, pluginId: id, options });
      },
    };
    await plugin(api);
  }

  // Built at most once per load, so hostless storage survives between events.
  let detached: ReturnType<typeof detachedContext> | undefined;
  const fallbackContext = () => (detached ??= detachedContext());

  // Reads `recorded` live, so a handler withdrawn between requests is not registered on the next.
  const replay: Extension = (tiny) => {
    for (const { pluginId: owner, event, handler } of recorded) {
      // Events this facade never fires are dropped, so pi extensions load without erroring.
      if (!firesEvent(event)) continue;
      const on = tiny.on as (event: string, handler: unknown) => void;
      const run = handler as (event: unknown, ctx: PluginEventContext) => unknown;
      // The request's own half wins, so `model` and `signal` always describe the call in flight.
      on(event, (fired: unknown, ctx: ExtensionContext) =>
        run(fired, { ...(context(owner) ?? fallbackContext()), ...ctx }),
      );
    }
  };

  // Tool names must be unique: first registration wins, the clash is reported.
  // Recomputed per snapshot so a retired winner's name passes to the runner-up.
  const activeTools = (report: boolean): ToolDefinition[] => {
    const tools: ToolDefinition[] = [];
    for (const { pluginId: owner, tool } of toolEntries) {
      if (!tools.some((existing) => existing.name === tool.name)) tools.push(tool);
      else if (report)
        reportPluginProblem({
          pluginId: owner,
          message: `tool "${tool.name}" is already registered`,
        });
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
      // `.map`, not `.some`: every list must be swept.
      .map((list) => owned(list as { readonly pluginId: string }[]))
      .includes(true);
    const sweptMarkdown = owned(markdown);
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
    // Only the first build reports clashes, so rebuilds do not repeat warnings.
    tools: activeTools(!built),
    toolEntries: [...toolEntries],
    markdown: [...markdown],
    providers: providers.list(),
    extensions: recorded.length > 0 ? [replay] : [],
    needs: new Map(needs),
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
