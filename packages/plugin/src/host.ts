import type { Extension, ExtensionAPI, ToolDefinition } from "@tiny/ai";
import { createEvents, type PluginEvents } from "./events.ts";
import { createProviderStore, type ProviderStore } from "./providers.ts";
import type {
  CommandInfo,
  CommandOptions,
  Contribution,
  KeyId,
  MarkdownContext,
  MarkdownTransformer,
  Plugin,
  PluginAPI,
  ProviderEntry,
  ShortcutOptions,
  SlotName,
} from "./types.ts";

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

/** Anonymous factories still need a stable key for namespaced storage. */
const pluginId = (plugin: Plugin, index: number): string =>
  plugin.name !== "" ? plugin.name : `plugin-${index}`;

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

export type LoadOptions = {
  /** Providers outlive one load, because pi allows registering after the factory. */
  readonly providers?: ProviderStore | undefined;
  /** The bus behind `pi.events`; one per host so plugins can reach each other. */
  readonly events?: PluginEvents | undefined;
  /** Resolved per call, so a handler running later sees the live host. */
  readonly host?: (() => HostActions) | undefined;
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
  const recorded: [string, unknown][] = [];
  const commands: Omit<CommandEntry, "invocationName">[] = [];
  const shortcuts: ShortcutEntry[] = [];
  const contributions: ContributionEntry[] = [];
  const toolEntries: ToolEntry[] = [];
  const markdown: MarkdownEntry[] = [];

  const providers = options.providers ?? createProviderStore();
  const events = options.events ?? createEvents();
  const host = options.host ?? detachedHost;
  // A reload re-runs every factory, so provider registrations must not stack up
  // on top of the previous load's.
  providers.reset();

  for (const [index, plugin] of plugins.entries()) {
    const id = pluginId(plugin, index);
    const api: PluginAPI = {
      // The overloads on PluginAPI keep callers honest; the recorder is
      // deliberately untyped so unfired pi events are stored just the same.
      on: (event: string, handler: unknown) => {
        recorded.push([event, handler]);
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

  // Replay is idempotent: `loadExtensions` builds fresh handler arrays per call.
  const replay: Extension = (pi) => {
    for (const [event, handler] of recorded) {
      const on = pi.on as (event: string, handler: unknown) => void;
      // Events this facade never fires are dropped rather than registered, so a
      // pi extension subscribing to `session_start` loads without erroring.
      if (FIRED_EVENTS.has(event)) on(event, handler);
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

/** The five events `@tiny/ai` actually emits. */
const FIRED_EVENTS: ReadonlySet<string> = new Set([
  "before_agent_start",
  "context",
  "message_start",
  "message_update",
  "message_end",
]);

/** Exposed for tests and for `ExtensionAPI`-shaped assertions. */
export type { ExtensionAPI };
