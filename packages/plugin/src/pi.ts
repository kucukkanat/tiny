/**
 * The `pi` object a plugin is handed, and everything it can be given back.
 *
 * This is the whole contract between a plugin and the host, in one file, so
 * "what can a plugin do?" is one thing to read. `PluginAPI` at the bottom is
 * what `pi` is; `PluginContext` is what handlers receive as `ctx`.
 *
 * Shaped after pi's extension SDK: a method here either has pi's exact signature
 * or is marked as ours. The parts with their own implementation live beside it —
 * key matching in keys.ts, slots in Slot.tsx, providers in providers.ts.
 */
import type { ApiType, EventMap, ExtensionContext, ToolDefinition } from "@tiny/ai";
import type { ComponentType, ReactNode } from "react";
import type { PluginEvents } from "./events.ts";
import type { KeyId } from "./keys.ts";
import type { ProviderConfig } from "./providers.ts";
import type { Contribution, SlotName } from "./Slot.tsx";
import type { ThemeLike } from "./theme.ts";

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

/** pi's `WorkingIndicatorOptions`, accepted and ignored. */
export type WorkingIndicatorOptions = {
  readonly frames?: readonly string[] | undefined;
  readonly intervalMs?: number | undefined;
};

/**
 * The UI surface handed to plugins.
 *
 * Everything pi's RPC mode keeps functional is implemented with pi's exact
 * signature; everything RPC no-ops is present and returns pi's documented
 * fallback, so a pi extension degrades here precisely as it would over RPC
 * rather than throwing on a missing method. See the README's divergence table.
 */
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
  /**
   * Open a React component as a modal overlay, resolving when it closes.
   *
   * Takes pi's dialog options for the same reason its dialogs do: an overlay
   * that outlives the request it belongs to has to be dismissable from the
   * outside. Dismissal resolves to `undefined`.
   */
  open<T>(
    render: (done: (result: T) => void) => ReactNode,
    opts?: DialogOptions,
  ): Promise<T | undefined>;

  /* — terminal-only: pi's documented RPC fallbacks — */
  readonly theme: ThemeLike;
  custom<T>(): Promise<T | undefined>;
  getToolsExpanded(): boolean;
  setToolsExpanded(expanded: boolean): void;
  setWorkingMessage(message?: string): void;
  setWorkingVisible(visible: boolean): void;
  setWorkingIndicator(options?: WorkingIndicatorOptions): void;
  setHiddenThinkingLabel(label?: string): void;
  setFooter(factory: unknown): void;
  setHeader(factory: unknown): void;
  setEditorComponent(factory: unknown): void;
  getEditorComponent(): undefined;
  onTerminalInput(handler: unknown): () => void;
  addAutocompleteProvider(factory: unknown): void;
  getAllThemes(): { name: string; path: string | undefined }[];
  getTheme(name: string): ThemeLike | undefined;
  setTheme(theme: unknown): { success: boolean; error?: string };
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

/**
 * pi passes `sessionManager`, `cwd` and `modelRegistry` here; none has an
 * analogue in a browser chat, so they are omitted in favour of the app's own
 * state. `ui`, `mode`, `hasUI` and `signal` keep pi's names and meanings.
 */
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

  /**
   * pi's, adapted: pi re-runs `/reload` over extensions discovered on disk,
   * this re-runs every plugin factory and rebuilds the registry. Both resolve
   * once the new runtime is live, and in both a plugin that no longer registers
   * is gone. Ours is also how a plugin installed at runtime is applied.
   */
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

/**
 * What an event handler receives.
 *
 * pi hands event handlers the same context its commands get — `ui` included,
 * which is what makes a permission gate possible at all — so this widens
 * `@tiny/ai`'s `{ model, signal }` with the plugin's own context rather than
 * asking plugins to smuggle `ui` out of a contributed component.
 *
 * `model` and `signal` always come from the live request. `hasUI` is the one
 * field that loosens: a registry loaded without a host (`loadPlugins` on its
 * own) still gets every method, but they return pi's dismissal values and
 * `hasUI` is false — exactly what pi reports in print mode, and exactly what
 * pi's own permission gates already guard on.
 */
export type PluginEventContext = ExtensionContext &
  Omit<PluginContext, "hasUI"> & { readonly hasUI: boolean };

/** pi's `ExtensionHandler`, over the wider context above. */
export type PluginEventHandler<E, R = undefined> = (
  event: E,
  ctx: PluginEventContext,
  // biome-ignore lint/suspicious/noConfusingVoidType: pi's signature, kept verbatim
) => Promise<R | void> | R | void;

/** Every pi event name, so a pi extension can subscribe without a type error. */
type UnfiredEvent =
  | "agent_end"
  | "agent_settled"
  | "agent_start"
  | "after_provider_response"
  | "before_provider_headers"
  | "before_provider_request"
  | "input"
  | "model_select"
  | "project_trust"
  | "resources_discover"
  | "session_before_compact"
  | "session_before_fork"
  | "session_before_switch"
  | "session_before_tree"
  | "session_compact"
  | "session_compact_failed"
  | "session_info_changed"
  | "session_shutdown"
  | "session_start"
  | "session_tree"
  | "thinking_level_select"
  | "tool_execution_end"
  | "tool_execution_start"
  | "tool_execution_update"
  | "tool_result"
  | "turn_end"
  | "turn_start"
  | "user_bash";

/* ------------------------------------------------------------------ *
 * Panels and pages — ours. pi is a terminal: it has one column of output
 * and no addresses, so neither of these has a pi equivalent to inherit.
 * ------------------------------------------------------------------ */

/**
 * A panel in the app's right-hand rail.
 *
 * The rail does not exist until a plugin registers one, and it is the plugin's
 * whole width to use — unlike `contribute`, which places a fragment among the
 * app's own chrome. Several panels become a tab strip, in registration order.
 */
export type PanelOptions = {
  /** The tab's label, and the panel's heading when it is the only one. */
  readonly title: string;
  /** Drawn in the tab and in the collapsed rail; the title's initial when absent. */
  readonly icon?: ReactNode | undefined;
  /** Rendered as the rail's body. Declare it outside the factory — see Slots. */
  readonly component: ComponentType;
};

/**
 * A page of the plugin's own, at a path the app routes to.
 *
 * The page replaces the thread; the app's chrome stays, so the user is never
 * stranded somewhere with no way back.
 */
export type RouteOptions = {
  /** Rendered as the whole main area. Declare it outside the factory. */
  readonly component: ComponentType;
  /**
   * When set, the app links to this page from its navigation. Leave it out for
   * a page reached some other way — a command, a button, `ctx.navigate`.
   */
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

export interface PluginAPI {
  /** Subscribe to a lifecycle event `@tiny/ai` fires. */
  on<K extends keyof EventMap>(
    event: K,
    handler: PluginEventHandler<EventMap[K][0], EventMap[K][1]>,
  ): void;
  /** Accepted so pi extensions load; these events never fire here. */
  on(event: UnfiredEvent, handler: (...args: never[]) => unknown): void;

  registerCommand(name: string, options: CommandOptions): void;
  registerShortcut(shortcut: KeyId, options: ShortcutOptions): void;
  /**
   * Register a tool the model may call. pi's shape, including `execute`'s
   * positional arguments and content-block result, except that `parameters` is
   * a plain JSON Schema object rather than a typebox `TSchema` — see
   * `ToolDefinition` in `@tiny/ai` for why.
   */
  registerTool(tool: ToolDefinition): void;
  /** Every command available to `runCommand`, in invocation order. */
  getCommands(): readonly CommandInfo[];

  /** Transform the markdown of a message before it is displayed. */
  registerMarkdownTransformer(transformer: MarkdownTransformer): void;

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

  /** Ours: render a React component into a named slot. */
  contribute(slot: SlotName, component: Contribution): void;

  /**
   * Ours: add a panel to the app's right-hand rail.
   *
   * `id` is namespaced by the plugin, so two plugins may both call theirs
   * `notes`; registering the same id twice within one plugin is a mistake and
   * the second is dropped with an error.
   */
  registerPanel(id: string, options: PanelOptions): void;

  /**
   * Ours: add a page at `path`, which must start with `/`.
   *
   * Unlike a command, a path cannot be disambiguated — it is the address the
   * router resolves — so the first registration wins and a later claim on the
   * same path is reported rather than silently shadowing it.
   */
  registerRoute(path: string, options: RouteOptions): void;
}

export type Plugin = {
  (pi: PluginAPI): void | Promise<void>;
  /**
   * Stable identity, used to namespace `ctx.storage` and to label this plugin's
   * errors. Declare it with `definePlugin` — see there for why it cannot be
   * inferred from the function's name.
   */
  readonly id?: string | undefined;
};

/**
 * A plugin with an explicit, stable identity.
 *
 * ```ts
 * export const greet = (): Plugin =>
 *   definePlugin("greet", (pi) => {
 *     pi.registerCommand("greet", { handler: (_a, ctx) => ctx.ui.notify("hi") });
 *   });
 * ```
 *
 * The id has to be written down because it cannot be derived. `Function.name`
 * would be the obvious source, and it is what a reader expects — but every
 * JavaScript minifier erases it, so a plugin identified that way has one
 * identity in development and a different one in the build users actually run.
 * Since the id namespaces `ctx.storage`, getting that wrong silently relocates
 * the user's data on their next release.
 *
 * A plugin without an id still loads: it falls back to its position in the list,
 * with a warning. That is fine for a throwaway, and wrong for anything that
 * stores something.
 */
export const definePlugin = (
  id: string,
  setup: (pi: PluginAPI) => void | Promise<void>,
): IdentifiedPlugin => Object.assign(setup, { id });

/**
 * A plugin that has declared its id — what `definePlugin` returns.
 *
 * `Plugin` stays permissive so a bare pi extension runs here unmodified, which
 * is the point of this package. An application that ships a fixed list should
 * type it as `readonly IdentifiedPlugin[]` instead, and let the compiler insist
 * on identity rather than finding out from a console warning in production.
 */
export type IdentifiedPlugin = Plugin & { readonly id: string };
