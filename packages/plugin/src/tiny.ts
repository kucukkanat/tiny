/** The plugin/host contract: `PluginAPI` is `tiny`, `PluginContext` is `ctx`. Shaped after pi's extension SDK. */
import type { ApiType, EventMap, ExtensionContext, ToolDefinition } from "@tiny/ai";
import type { ComponentType, ReactNode } from "react";
import type { PluginEvents } from "./events.ts";
import type { KeyId } from "./keys.ts";
import type { ProviderConfig } from "./providers.ts";
import type { PropsOf, SlotName } from "./Slot.tsx";

/* ------------------------------------------------------------------ *
 * UI — pi's `ExtensionUIContext`, split by what RPC mode proves portable.
 * ------------------------------------------------------------------ */

export type DialogOptions = {
  /** AbortSignal to programmatically dismiss the dialog. */
  readonly signal?: AbortSignal | undefined;
  /** Timeout in milliseconds; the dialog auto-dismisses with its default value. */
  readonly timeout?: number | undefined;
};

export type WidgetPlacement = "aboveEditor" | "belowEditor";
export type WidgetOptions = { readonly placement?: WidgetPlacement | undefined };
export type NotifyLevel = "info" | "warning" | "error";

/** The UI surface handed to plugins. pi's terminal-only half exists at runtime but is typed separately as `PiTerminalUI`. */
export type PluginUIContext = {
  /* — portable: dialogs — */
  select(title: string, options: string[], opts?: DialogOptions): Promise<string | undefined>;
  confirm(title: string, message: string, opts?: DialogOptions): Promise<boolean>;
  input(title: string, placeholder?: string, opts?: DialogOptions): Promise<string | undefined>;
  /** pi takes no options here, so neither do we. */
  editor(title: string, prefill?: string): Promise<string | undefined>;

  /* — portable: fire-and-forget — */
  notify(message: string, type?: NotifyLevel): void;
  setStatus(key: string, text: string | undefined): void;
  setWidget(key: string, content: string[] | undefined, options?: WidgetOptions): void;
  setTitle(title: string): void;
  setEditorText(text: string): void;
  pasteToEditor(text: string): void;
  /** The composer's current text. Real here — this host owns the composer. */
  getEditorText(): string;

  /* — ours: no portable pi equivalent — */
  /** Open a React component as a modal overlay, resolving when it closes; dismissal resolves `undefined`. */
  open<T>(
    render: (done: (result: T) => void) => ReactNode,
    opts?: DialogOptions,
  ): Promise<T | undefined>;
};

/* ------------------------------------------------------------------ *
 * Context
 * ------------------------------------------------------------------ */

/** Structural mirrors of the app's stored shapes, so this package stays app-free. */
export type PluginMessage = {
  /** Matches `@tiny/ai`'s `ChatRole`, so the app's stored messages fit as-is. */
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
  readonly reasoning?: string | undefined;
  readonly reasoningSeconds?: number | undefined;
};
export type PluginStreaming = {
  readonly reasoning: string;
  readonly text: string;
  readonly reasoningSeconds: number;
};
export type PluginSettings = {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  /** Which registered provider `model` belongs to; the user's own endpoint when absent. */
  readonly providerId?: string | undefined;
  /** Which pi api the endpoint speaks; absent means `openai-completions`. */
  readonly api?: ApiType | undefined;
};

/** Whether an endpoint is configured enough to send with. */
export const settingsComplete = (
  settings: PluginSettings | undefined,
): settings is PluginSettings =>
  settings !== undefined &&
  settings.baseUrl.trim() !== "" &&
  settings.apiKey.trim() !== "" &&
  settings.model.trim() !== "";

/** Namespaced per plugin, so a plugin can persist state without touching app data. */
export type PluginStorage = {
  get<T>(key: string): T | undefined;
  set(key: string, value: unknown): void;
  remove(key: string): void;
};

export type PluginChat = {
  readonly messages: readonly PluginMessage[];
  readonly streaming: PluginStreaming | undefined;
  send(text: string): void;
  stop(): void;
};

/** pi's `ContextUsage`, over what a bring-your-own endpoint actually reports. */
export type ContextUsage = {
  readonly input: number;
  readonly output: number;
  readonly totalTokens: number;
  /** 0 when the endpoint publishes no window, which is the usual case. */
  readonly contextWindow: number;
};

/** pi's context minus `sessionManager`/`cwd`/`modelRegistry`, which have no browser analogue. */
export type PluginContext = {
  readonly ui: PluginUIContext;
  /** A new member of pi's union — existing `ctx.mode === "tui"` guards stay false. */
  readonly mode: "react";
  readonly hasUI: true;
  readonly signal: AbortSignal | undefined;
  readonly chat: PluginChat;
  readonly settings: PluginSettings | undefined;
  updateSettings(next: PluginSettings): void;
  navigate(path: string): void;
  readonly storage: PluginStorage;
  runCommand(name: string, args?: string): Promise<void>;
  readonly commands: readonly CommandInfo[];

  /** Abort the reply in flight, as `ctx.abort()` does in pi. */
  abort(): void;
  /** False while a reply is streaming. */
  isIdle(): boolean;
  hasPendingMessages(): boolean;
  /** Tokens and window for the conversation so far. */
  getContextUsage(): ContextUsage;
  /** Start a fresh conversation, as pi's `ctx.newSession()` does. */
  newSession(): void;

  /** Re-runs every plugin factory and rebuilds the registry, resolving once the new runtime is live. */
  reload(): Promise<void>;
};

/* ------------------------------------------------------------------ *
 * Registration
 * ------------------------------------------------------------------ */

export type AutocompleteItem = {
  readonly value: string;
  readonly label: string;
  readonly description?: string | undefined;
};

/** pi's `RegisteredCommand` minus `name`/`sourceInfo`, with a widened return. */
export type CommandOptions = {
  readonly description?: string | undefined;
  readonly getArgumentCompletions?:
    | ((argumentPrefix: string) => AutocompleteItem[] | null | Promise<AutocompleteItem[] | null>)
    | undefined;
  handler(args: string, ctx: PluginContext): Promise<void> | void;
};

export type CommandInfo = { readonly name: string; readonly description: string | undefined };

export type ShortcutOptions = {
  readonly description?: string | undefined;
  handler(ctx: PluginContext): Promise<void> | void;
};

/** What an event handler receives: `ExtensionContext` widened with the plugin context.
 * `hasUI` is false (with methods returning pi's dismissal values) when no host is mounted. */
export type PluginEventContext = ExtensionContext &
  Omit<PluginContext, "hasUI"> & { readonly hasUI: boolean };

/** pi's `ExtensionHandler`, over the wider context above. */
export type PluginEventHandler<E, R = undefined> = (
  event: E,
  ctx: PluginEventContext,
  // biome-ignore lint/suspicious/noConfusingVoidType: pi's signature, kept verbatim
) => Promise<R | void> | R | void;

/* ------------------------------------------------------------------ *
 * Panels and pages — ours. pi is a terminal: it has one column of output
 * and no addresses, so neither of these has a pi equivalent to inherit.
 * ------------------------------------------------------------------ */

/** A panel in the app's right-hand rail; several panels become a tab strip, in registration order. */
export type PanelOptions = {
  /** The tab's label, and the panel's heading when it is the only one. */
  readonly title: string;
  /** Drawn in the tab and in the collapsed rail; the title's initial when absent. */
  readonly icon?: ReactNode | undefined;
  /** Rendered as the rail's body. Declare it outside the factory — see Slots. */
  readonly component: ComponentType;
};

/** A page of the plugin's own, at a path the app routes to; it replaces the thread, the app's chrome stays. */
export type RouteOptions = {
  /** Rendered as the whole main area. Declare it outside the factory. */
  readonly component: ComponentType;
  /** When set, the app links to this page from its navigation. */
  readonly label?: string | undefined;
  readonly icon?: ReactNode | undefined;
};

/* ------------------------------------------------------------------ *
 * Markdown
 * ------------------------------------------------------------------ */

export type MarkdownContext = {
  readonly messageType: "user" | "assistant" | "assistant-thinking";
  /** True for partial assistant updates; false for finalized and restored text. */
  readonly isStreaming: boolean;
};

/** pi's transformer, minus `availableWidth` — a browser has no column count. */
export type MarkdownTransformer = (markdown: string, context: MarkdownContext) => string;

/** Withdraws one registration. Calling it twice is harmless; ignoring it is the normal case. */
export type Dispose = () => void;

export interface PluginAPI {
  /** Subscribe to a lifecycle event `@tiny/ai` fires. Every name here is live. */
  on<K extends keyof EventMap>(
    event: K,
    handler: PluginEventHandler<EventMap[K][0], EventMap[K][1]>,
  ): Dispose;

  registerCommand(name: string, options: CommandOptions): Dispose;
  registerShortcut(shortcut: KeyId, options: ShortcutOptions): Dispose;
  /** Register a tool the model may call; pi's shape, but `parameters` is plain JSON Schema, not typebox. */
  registerTool(tool: ToolDefinition): Dispose;
  /** Every command available to `runCommand`, in invocation order. */
  getCommands(): readonly CommandInfo[];

  /** Transform the markdown of a message before it is displayed. */
  registerMarkdownTransformer(transformer: MarkdownTransformer): Dispose;

  /** Add an endpoint to the model picker. A repeat id replaces the earlier one. */
  registerProvider(id: string, config: ProviderConfig): void;
  /** Remove one. Returns whether there was anything to remove. */
  unregisterProvider(id: string): boolean;

  /** The tools the model may call this turn, and which of them are enabled. */
  getAllTools(): readonly string[];
  getActiveTools(): readonly string[];
  setActiveTools(names: readonly string[]): void;

  /** Switch the model the next request uses. */
  setModel(model: string): void;
  /** Send a message as the user. */
  sendUserMessage(content: string): void;
  /** The current conversation's title. */
  getSessionName(): string | undefined;
  setSessionName(name: string): void;

  /** The bus plugins talk to each other over — not the lifecycle events above. */
  readonly events: PluginEvents;

  /** Ours: render a React component into a named slot. Props are inferred from the slot,
   * so a mismatch is a compile error; plugins declare their own slots by augmenting `SlotProps`. */
  contribute<S extends SlotName>(slot: S, component: ComponentType<PropsOf<S>>): Dispose;

  /** Ours: add a panel to the app's right-hand rail. `id` is namespaced by the plugin;
   * a repeat id within one plugin is dropped with an error. */
  registerPanel(id: string, options: PanelOptions): Dispose;

  /** Ours: add a page at `path`, which must start with `/`. First registration wins; later claims are reported. */
  registerRoute(path: string, options: RouteOptions): Dispose;
}

export type Plugin = {
  /** A returned promise is awaited before the next plugin loads; the return value is otherwise ignored. */
  (tiny: PluginAPI): void | Promise<void> | Dispose;
  /** Stable identity, namespacing `ctx.storage` and labelling errors; declare it with `definePlugin`. */
  readonly id?: string | undefined;
  /** Ids this plugin loads after; `"*"` for all of them. See `PluginOrder`. */
  readonly after?: readonly string[] | undefined;
  /** Ids this plugin loads before; `"*"` for all of them. See `PluginOrder`. */
  readonly before?: readonly string[] | undefined;
  /** What this plugin asked for. Absent means it asked for nothing, and gets all. */
  readonly needs?: readonly Capability[] | undefined;
};

/**
 * `definePlugin` gives a plugin an explicit, stable id (minifiers erase `Function.name`,
 * and the id namespaces `ctx.storage`):
 * ```ts
 * export const greet = (): Plugin =>
 *   definePlugin("greet", (tiny) => {
 *     tiny.registerCommand("greet", { handler: (_a, ctx) => ctx.ui.notify("hi") });
 *   });
 * ```
 */
/** Relative load order. Names that are not installed are ignored; the list's own order decides the rest. */
export type PluginOrder = {
  /** Load after these ids. `"*"` means after every other plugin. */
  readonly after?: readonly string[] | undefined;
  /** Load before these ids. `"*"` means before every other plugin. */
  readonly before?: readonly string[] | undefined;
};

/** Something a plugin has to ask for — only things this package can actually withhold. */
export type Capability =
  /** Read `ctx.settings`, which carries the user's API key, and change it. */
  | "settings"
  /** Read the conversation: `ctx.chat.messages` and `ctx.chat.streaming`. */
  | "chat"
  /** Register tools the model may call. */
  | "tools";

export type PluginOptions = PluginOrder & {
  /** What this plugin needs. Declaring nothing grants everything; declaring narrows what `ctx` is handed.
   * A declaration, not a sandbox — it does not stop page-level access. */
  readonly needs?: readonly Capability[] | undefined;
};

export function definePlugin(
  id: string,
  setup: (tiny: PluginAPI) => void | Promise<void> | Dispose,
): IdentifiedPlugin;
export function definePlugin(
  id: string,
  options: PluginOptions,
  setup: (tiny: PluginAPI) => void | Promise<void> | Dispose,
): IdentifiedPlugin;
export function definePlugin(
  id: string,
  second: PluginOptions | ((tiny: PluginAPI) => void | Promise<void> | Dispose),
  third?: (tiny: PluginAPI) => void | Promise<void> | Dispose,
): IdentifiedPlugin {
  const setup = typeof second === "function" ? second : third;
  if (setup === undefined) throw new TypeError(`definePlugin("${id}") was given no setup function`);
  const options = typeof second === "function" ? {} : second;
  return Object.assign(setup, {
    id,
    ...(options.after === undefined ? {} : { after: options.after }),
    ...(options.before === undefined ? {} : { before: options.before }),
    ...(options.needs === undefined ? {} : { needs: options.needs }),
  });
}

/** A plugin that has declared its id — what `definePlugin` returns.
 * Apps shipping a fixed list should type it `readonly IdentifiedPlugin[]`. */
export type IdentifiedPlugin = Plugin & { readonly id: string };
