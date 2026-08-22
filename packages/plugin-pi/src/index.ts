// pi compatibility, opt-in: the `ctx.ui` methods a browser cannot implement and the event names this host never fires.
import type { EventMap } from "@tiny/ai";
import type { Dispose, Plugin, PluginAPI, PluginEventHandler, PluginUIContext } from "@tiny/plugin";
import type { ThemeLike } from "./theme.ts";
import { identityTheme } from "./theme.ts";

export type { ThemeLike } from "./theme.ts";
export { identityTheme } from "./theme.ts";

/** pi's `WorkingIndicatorOptions`, accepted and ignored. */
export type WorkingIndicatorOptions = {
  readonly frames?: readonly string[] | undefined;
  readonly intervalMs?: number | undefined;
};

/** pi's terminal-only `ctx.ui` methods — every one a no-op or fixed answer here. */
export type PiTerminalUI = {
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

/** pi's whole `ctx.ui`, for an extension written against pi's SDK. */
export type PiUIContext = PluginUIContext & PiTerminalUI;

/**
 * pi's documented RPC fallbacks for the terminal-only half of `ctx.ui`;
 * pass to `PluginHost` as `uiFallbacks`.
 */
export const piTerminalUI: PiTerminalUI = {
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

/** pi event names this host never fires; subscribable via `PiPluginAPI`, never delivered. */
export type UnfiredEvent =
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

/**
 * `PluginAPI` widened to what a pi extension expects — a compile-time widening
 * only; nothing that exists only here will ever run.
 */
export type PiPluginAPI = Omit<PluginAPI, "on"> & {
  on<K extends keyof EventMap>(
    event: K,
    handler: PluginEventHandler<EventMap[K][0], EventMap[K][1]>,
  ): Dispose;
  /** Accepted so a pi extension loads; these never fire here. */
  on(event: UnfiredEvent, handler: (...args: never[]) => unknown): Dispose;
};

/** Loads an extension written against pi's surface — a sound cast in one place. */
export const piExtension =
  (setup: (tiny: PiPluginAPI) => void | Promise<void> | Dispose): Plugin =>
  (tiny: PluginAPI) =>
    setup(tiny as PiPluginAPI);
