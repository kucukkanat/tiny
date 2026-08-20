import { type Extension, type ExtensionContext, firesEvent, type ToolDefinition } from "@tiny/ai";
import { createEvents, type PluginEvents } from "./events.ts";
import type { KeyId } from "./keys.ts";
import type {
  CommandInfo,
  CommandOptions,
  MarkdownContext,
  MarkdownTransformer,
  Plugin,
  PluginAPI,
  PluginContext,
  PluginEventContext,
  PluginUIContext,
  ShortcutOptions,
} from "./pi.ts";
import type { ProviderEntry } from "./providers.ts";
import { createProviderStore, type ProviderStore } from "./providers.ts";
import type { Contribution, SlotName } from "./Slot.tsx";
import { identityTheme } from "./theme.ts";

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

export const emptyRegistry: Registry = {
  commands: [],
  shortcuts: [],
  contributions: [],
  tools: [],
  toolEntries: [],
  markdown: [],
  providers: [],
  extensions: [],
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

/** The id given to a plugin that declared none: its position in the list. */
export const positionalId = (index: number): string => `plugin-${index}`;

/** Whether an id was derived from list position rather than declared. */
export const isPositionalId = (id: string): boolean => /^plugin-\d+$/.test(id);

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
  plugin.id !== undefined && plugin.id !== "" ? plugin.id : positionalId(index);

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
 * The host actions `pi.*` methods reach through.
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
    console.error(`[plugin] pi.${method}() needs a mounted PluginHost`);
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
  /** The bus behind `pi.events`; one per host so plugins can reach each other. */
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
): Promise<Registry> => {
  const recorded: [pluginId: string, event: string, handler: unknown][] = [];
  const commands: Omit<CommandEntry, "invocationName">[] = [];
  const shortcuts: ShortcutEntry[] = [];
  const contributions: ContributionEntry[] = [];
  const toolEntries: ToolEntry[] = [];
  const markdown: MarkdownEntry[] = [];

  const providers = options.providers ?? createProviderStore();
  const events = options.events ?? createEvents();
  const host = options.host ?? detachedHost;
  const context = options.context ?? (() => undefined);
  // A reload re-runs every factory, so provider registrations must not stack up
  // on top of the previous load's.
  providers.reset();

  for (const [index, plugin] of plugins.entries()) {
    const id = pluginId(plugin, index);
    const api: PluginAPI = {
      // The overloads on PluginAPI keep callers honest; the recorder is
      // deliberately untyped so unfired pi events are stored just the same.
      on: (event: string, handler: unknown) => {
        recorded.push([id, event, handler]);
      },
      registerCommand: (name, options) => {
        commands.push({ name, pluginId: id, options });
      },
      registerShortcut: (shortcut, options) => {
        shortcuts.push({ shortcut, pluginId: id, options });
      },
      registerTool: (tool) => {
        toolEntries.push({ pluginId: id, tool });
      },
      registerMarkdownTransformer: (transformer) => {
        markdown.push({ pluginId: id, transformer });
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
        contributions.push({
          id: `${id}#${contributions.length}`,
          slot,
          pluginId: id,
          component,
        });
      },
    } as PluginAPI;
    await plugin(api);
  }

  // Built at most once per load, so a plugin running without a host still gets
  // storage that survives between events rather than a fresh empty one each time.
  let detached: ReturnType<typeof detachedContext> | undefined;
  const fallbackContext = () => (detached ??= detachedContext());

  // Replay is idempotent: `loadExtensions` builds fresh handler arrays per call.
  const replay: Extension = (pi) => {
    for (const [owner, event, handler] of recorded) {
      // Events this facade never fires are dropped rather than registered, so a
      // pi extension subscribing to `session_start` loads without erroring.
      if (!firesEvent(event)) continue;
      const on = pi.on as (event: string, handler: unknown) => void;
      const run = handler as (event: unknown, ctx: PluginEventContext) => unknown;
      // `@tiny/ai` can only supply `{ model, signal }`; pi hands handlers the
      // same context its commands get. The request's own half wins, so `model`
      // and `signal` always describe the call in flight.
      on(event, (fired: unknown, ctx: ExtensionContext) =>
        run(fired, { ...(context(owner) ?? fallbackContext()), ...ctx }),
      );
    }
  };

  // A tool name has to be unique for the model to address it, so unlike
  // commands a duplicate cannot be suffixed — the first registration wins and
  // the clash is reported rather than silently shadowing.
  const tools: ToolDefinition[] = [];
  for (const { pluginId: owner, tool } of toolEntries) {
    const clash = tools.some((existing) => existing.name === tool.name);
    if (clash) console.error(`[plugin:${owner}] tool "${tool.name}" is already registered`);
    else tools.push(tool);
  }

  return {
    commands: withInvocationNames(commands),
    shortcuts,
    contributions,
    tools,
    toolEntries,
    markdown,
    providers: providers.list(),
    extensions: recorded.length > 0 ? [replay] : [],
  };
};
