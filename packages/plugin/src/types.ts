import type {
  ApiType,
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ContextEvent,
  ContextEventResult,
  ExtensionHandler,
  MessageEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
  ModelOptions,
  ToolDefinition,
} from "@tiny/ai";
import type { ComponentType, ReactNode } from "react";
import type { PluginEvents } from "./events.ts";

/* ------------------------------------------------------------------ *
 * Keys — pi's `KeyId` shape (@earendil-works/pi-tui `keys.d.ts`).
 * ------------------------------------------------------------------ */

type Letter =
  | "a"
  | "b"
  | "c"
  | "d"
  | "e"
  | "f"
  | "g"
  | "h"
  | "i"
  | "j"
  | "k"
  | "l"
  | "m"
  | "n"
  | "o"
  | "p"
  | "q"
  | "r"
  | "s"
  | "t"
  | "u"
  | "v"
  | "w"
  | "x"
  | "y"
  | "z";
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type SymbolKey =
  | "`"
  | "-"
  | "="
  | "["
  | "]"
  | "\\"
  | ";"
  | "'"
  | ","
  | "."
  | "/"
  | "!"
  | "@"
  | "#"
  | "$"
  | "%"
  | "^"
  | "&"
  | "*"
  | "("
  | ")"
  | "_"
  | "+"
  | "|"
  | "~"
  | "{"
  | "}"
  | ":"
  | "<"
  | ">"
  | "?";
type SpecialKey =
  | "escape"
  | "esc"
  | "enter"
  | "return"
  | "tab"
  | "space"
  | "backspace"
  | "delete"
  | "insert"
  | "home"
  | "end"
  | "pageUp"
  | "pageDown"
  | "up"
  | "down"
  | "left"
  | "right";
type BaseKey = Letter | Digit | SymbolKey | SpecialKey;

/** pi's modifier set exactly — note there is no `mod`; `super` is Cmd on macOS. */
type Modifier = "ctrl" | "shift" | "alt" | "super";

/**
 * pi expands modifiers recursively; two levels covers every practical binding
 * without the compiler cost of the full expansion.
 */
export type KeyId = BaseKey | `${Modifier}+${BaseKey}` | `${Modifier}+${Modifier}+${BaseKey}`;

/* ------------------------------------------------------------------ *
 * Theme — pi's `Theme` class, reduced to the string-in/string-out methods.
 * ------------------------------------------------------------------ */

/**
 * `ctx.ui.theme` is a live property in pi and extensions call it inline
 * (`theme.fg("accent", "●")`). A browser has no ANSI, so every method is the
 * identity — a pi extension styling a string gets its string back unstyled
 * rather than a crash.
 */
export type ThemeLike = {
  readonly name?: string | undefined;
  fg(color: string, text: string): string;
  bg(color: string, text: string): string;
  bold(text: string): string;
  italic(text: string): string;
  underline(text: string): string;
  inverse(text: string): string;
  strikethrough(text: string): string;
  getFgAnsi(color: string): string;
  getBgAnsi(color: string): string;
  getColorMode(): "truecolor" | "256color";
};

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

  /* — ours: no portable pi equivalent — */
  /** Open a React component as a modal overlay, resolving when it closes. */
  open<T>(render: (done: (result: T) => void) => ReactNode): Promise<T | undefined>;

  /* — terminal-only: pi's documented RPC fallbacks — */
  readonly theme: ThemeLike;
  custom<T>(): Promise<T | undefined>;
  getEditorText(): string;
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
};

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

/** Named regions of the app a plugin can render into. */
export type SlotName = "app.overlays" | "composer.actions" | "sidebar.footer" | "message.actions";

/** Props a slot passes down; `message.actions` is the only one that carries data. */
export type SlotProps = {
  readonly message?: PluginMessage | undefined;
  readonly index?: number | undefined;
};

export type Contribution = ComponentType<SlotProps>;

type EventMap = {
  before_agent_start: [BeforeAgentStartEvent, BeforeAgentStartEventResult];
  context: [ContextEvent, ContextEventResult];
  message_start: [MessageStartEvent, undefined];
  message_update: [MessageUpdateEvent, undefined];
  message_end: [MessageEndEvent, undefined];
};

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
  | "tool_call"
  | "tool_execution_end"
  | "tool_execution_start"
  | "tool_execution_update"
  | "tool_result"
  | "turn_end"
  | "turn_start"
  | "user_bash";

/* ------------------------------------------------------------------ *
 * Providers — pi's `registerProvider`, reduced to what a browser can hold.
 * ------------------------------------------------------------------ */

/**
 * An OpenAI-compatible endpoint a plugin adds to the model picker.
 *
 * pi's `ProviderConfig` also carries credential storage, catalog persistence
 * and a native `Provider` implementation from `pi-ai`; none has anywhere to
 * live here, and `@tiny/ai` streams to an endpoint directly rather than through
 * pi-ai's provider registry. What remains is the part that actually travels:
 * where to send the request, how to authenticate, and which models exist.
 */
export type ProviderConfig = {
  /** Shown in the model picker. */
  readonly name: string;
  /** e.g. "https://api.groq.com/openai/v1". */
  readonly baseUrl: string;
  /** A key, or a thunk so a plugin can prompt for one instead of storing it. */
  readonly apiKey?: string | (() => string | Promise<string>) | undefined;
  /**
   * Which pi streaming implementation this endpoint speaks. Defaults to
   * `openai-completions`. As in pi, a model may override it.
   */
  readonly api?: ApiType | undefined;
  /**
   * pi's `fetchModels`, narrowed: a fixed list or a lookup. Omit it and the
   * endpoint's own models route is used, which is what most servers publish.
   *
   * An entry may be a bare id, or an object carrying what the endpoint cannot
   * publish about it — its api, whether it reasons, its window.
   */
  readonly models?:
    | readonly ProviderModel[]
    | ((signal: AbortSignal | undefined) => Promise<readonly ProviderModel[]>)
    | undefined;
};

/** A model id, or an id with the metadata a bare `/models` route cannot carry. */
export type ProviderModel = string | ({ readonly id: string } & ModelOptions);

export type ProviderEntry = {
  readonly id: string;
  readonly pluginId: string;
  readonly config: ProviderConfig;
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
    handler: ExtensionHandler<EventMap[K][0], EventMap[K][1]>,
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
}

export type Plugin = (pi: PluginAPI) => void | Promise<void>;
