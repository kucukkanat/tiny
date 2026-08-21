/**
 * pi compatibility, kept out of the way of everyone who does not want it.
 *
 * `@tiny/plugin` is shaped after pi's extension SDK, and most of that shape is
 * simply the SDK: dialogs, commands, shortcuts, tools, events. What lives here
 * is the part that only exists so a pi extension does not crash — seventeen
 * `ctx.ui` methods a browser cannot implement, and thirty-odd event names this
 * host never fires.
 *
 * They were in the core, on by default, for every app and every plugin. Now the
 * app that wants them asks:
 *
 * ```tsx
 * import { piTerminalUI } from "@tiny/plugin-pi";
 *
 * <PluginHost plugins={plugins} uiFallbacks={piTerminalUI}>…</PluginHost>
 * ```
 *
 * Without it, `ctx.ui` has only methods that do something, and a pi extension
 * reaching for `setFooter` gets a `TypeError` instead of silence — which is the
 * better failure, and the one an app not running pi extensions should have.
 */
import type { EventMap } from "@tiny/ai";
import type { Dispose, Plugin, PluginAPI, PluginEventHandler, PluginUIContext } from "@tiny/plugin";
import type { ThemeLike } from "./theme.ts";
import { identityTheme } from "./theme.ts";

export type { ThemeLike } from "./theme.ts";
export { identityTheme } from "./theme.ts";

/**
 * pi's terminal-only `ctx.ui`: present at runtime, doing what RPC mode does.
 *
 * Every one of these is a no-op or a fixed answer here — a browser has no
 * footer, no terminal input and no theme registry — so an extension calling one
 * degrades exactly as it would over pi's RPC transport rather than throwing.
 * They are typed apart from `PluginUIContext` because a method that cannot work
 * should not be offered to someone writing a new plugin: sixteen dead entries in
 * autocomplete are indistinguishable from the live ones, and finding out which
 * is which costs a debugging session.
 *
 * See the divergence table in [pi compatibility](../../../apps/docs/content/pi-compat.md).
 */
/** pi's `WorkingIndicatorOptions`, accepted and ignored. */
export type WorkingIndicatorOptions = {
  readonly frames?: readonly string[] | undefined;
  readonly intervalMs?: number | undefined;
};

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
 * pi's documented RPC fallbacks for the terminal-only half of `ctx.ui`.
 *
 * Present, never throwing, returning what an extension would get over pi's RPC
 * transport — so a ported extension degrades here exactly as it would there.
 * Pass it to `PluginHost` as `uiFallbacks` to turn that on.
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

/**
 * pi event names this host never fires.
 *
 * Kept so a pi extension can subscribe without a type error, and off `PluginAPI`
 * so a new plugin cannot reach for one by accident: `tiny.on("turn_start", …)`
 * used to typecheck, autocomplete, and never run — a silence with no error
 * message anywhere to explain it. `PiPluginAPI` is how an extension that wants
 * these asks for them, and the answer is still that they never arrive.
 */
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
 * `PluginAPI` widened to what a pi extension expects: the events this host never
 * fires are subscribable, and `ctx.ui` carries pi's terminal-only half.
 *
 * The runtime object is the same one either way — nothing is added by naming
 * this type, and nothing that only exists here will ever run. It is a way to
 * compile an extension written for pi without editing it, and the honest
 * summary of what it buys is in
 * [pi compatibility](../../../apps/docs/content/pi-compat.md).
 */
export type PiPluginAPI = Omit<PluginAPI, "on"> & {
  on<K extends keyof EventMap>(
    event: K,
    handler: PluginEventHandler<EventMap[K][0], EventMap[K][1]>,
  ): Dispose;
  /** Accepted so a pi extension loads; these never fire here. */
  on(event: UnfiredEvent, handler: (...args: never[]) => unknown): Dispose;
};

/**
 * Loads an extension written against pi's surface.
 *
 * The wrapper exists so the loader's parameter can stay `Plugin`: a union there
 * would leave every inline `(tiny) => …` without a contextual type, which costs
 * every plugin author inference to buy something only a pi extension wants. The
 * widening is a cast in one place instead, and it is sound — the runtime object
 * has pi's terminal methods on it, returning pi's RPC fallbacks.
 *
 * ```ts
 * export default piExtension((tiny) => {
 *   tiny.on("session_start", () => {}); // accepted, and never fired
 * });
 * ```
 */
export const piExtension =
  (setup: (tiny: PiPluginAPI) => void | Promise<void> | Dispose): Plugin =>
  (tiny: PluginAPI) =>
    setup(tiny as PiPluginAPI);
