import { createContext, useContext, useEffect, useMemo } from "react";
import { createEvents, type PluginEvents } from "./events.ts";
import type {
  CommandInfo,
  MarkdownContext,
  PluginContext,
  PluginMessage,
  PluginSettings,
  PluginStreaming,
  WidgetPlacement,
} from "./pi.ts";
import type { ProviderEntry } from "./providers.ts";
import type { MarkdownEntry, Registry } from "./registry.ts";
import { emptyRegistry, transformMarkdown } from "./registry.ts";

export type Widget = { readonly lines: readonly string[]; readonly placement: WidgetPlacement };

/**
 * What the app publishes into the host. Chat state lives in `App`, below the
 * provider, so it is pushed up rather than lifted — keeping `App`'s structure
 * untouched.
 */
export type AppBridge = {
  readonly messages: readonly PluginMessage[];
  readonly streaming: PluginStreaming | undefined;
  readonly settings: PluginSettings | undefined;
  readonly signal: AbortSignal | undefined;
  send(text: string): void;
  stop(): void;
  updateSettings(next: PluginSettings): void;
  navigate(path: string): void;
  /**
   * The current conversation's name, behind `pi.getSessionName()`. Optional
   * because not every host that mounts this has named sessions; where it is
   * absent the pi methods report as much rather than pretending.
   */
  readonly sessionName?: string | undefined;
  setSessionName?(name: string): void;
};

export type HostValue = {
  readonly registry: Registry;
  readonly widgets: ReadonlyMap<string, Widget>;
  readonly statuses: ReadonlyMap<string, string>;
  readonly commands: readonly CommandInfo[];
  /** Live, because pi allows registering a provider after the factory returns. */
  readonly providers: readonly ProviderEntry[];
  /** The tool names currently enabled — `pi.getActiveTools()`. */
  readonly activeTools: readonly string[];
  /** The bus behind `pi.events`. */
  readonly events: PluginEvents;
  /** Text pushed at the composer by `ctx.ui.setEditorText`. */
  readonly editorText: string;
  setEditorText(text: string): void;
  runCommand(name: string, args?: string): Promise<void>;
  contextFor(pluginId: string): PluginContext;
  publish(bridge: AppBridge): void;
};

const noop = () => {};

export const HostContext = createContext<HostValue>({
  registry: emptyRegistry,
  widgets: new Map(),
  statuses: new Map(),
  commands: [],
  providers: [],
  activeTools: [],
  events: createEvents(),
  editorText: "",
  setEditorText: noop,
  runCommand: async () => {},
  contextFor: () => {
    throw new Error("usePluginContext must be used inside <PluginHost>");
  },
  publish: noop,
});

/** Identifies which plugin a contributed component came from. */
export const PluginIdContext = createContext<string>("unknown");

export const usePluginHost = (): HostValue => useContext(HostContext);

/**
 * The `PluginContext` for the calling contribution — same object commands and
 * shortcuts receive, namespaced to the contributing plugin.
 */
export function usePluginContext(): PluginContext {
  const host = usePluginHost();
  return host.contextFor(useContext(PluginIdContext));
}

/**
 * What to hand `streamChat` as its `extensions`.
 *
 * Not one extension per plugin: every `pi.on(...)` call made by every plugin is
 * recorded during load and replayed through a *single* bridge extension, which
 * is what lets `@tiny/ai` stay unaware of plugins. The host appends one more of
 * its own for token accounting. So this is 0, 1 or 2 entries regardless of how
 * many plugins are loaded — see `loadPlugins` in registry.ts.
 */
export function usePluginExtensions() {
  return usePluginHost().registry.extensions;
}

/**
 * The tools plugins registered, for `useChat` to hand to `streamChat` — minus
 * any that `pi.setActiveTools` switched off.
 */
export function usePluginTools() {
  const { registry, activeTools } = usePluginHost();
  return useMemo(
    () => registry.tools.filter((tool) => activeTools.includes(tool.name)),
    [registry, activeTools],
  );
}

/** The endpoints plugins registered with `pi.registerProvider`. */
export function usePluginProviders(): readonly ProviderEntry[] {
  return usePluginHost().providers;
}

/** The bus behind `pi.events`, for a component that wants to join in. */
export function usePluginEvents(): PluginEvents {
  return usePluginHost().events;
}

/**
 * Runs the registered markdown transformers over one message.
 *
 * A hook rather than a plain call so a component re-renders when a plugin that
 * registers one is added or removed.
 */
export function useMarkdown(markdown: string, context: MarkdownContext): string {
  const entries: readonly MarkdownEntry[] = usePluginHost().registry.markdown;
  return useMemo(
    () => (entries.length === 0 ? markdown : transformMarkdown(entries, markdown, context)),
    [entries, markdown, context],
  );
}

/**
 * Called once by `App` to publish live chat state and actions into the host.
 *
 * **Memoise the bridge**, as you would a context value. The host skips
 * publishing when every field is referentially unchanged, so a rebuilt wrapper
 * around stable values is safe — but a field that gets a new identity on every
 * render (an inline arrow, a freshly-built array) will re-render the host in a
 * loop.
 */
export function useProvideApp(bridge: AppBridge): void {
  const { publish } = usePluginHost();
  useEffect(() => publish(bridge), [publish, bridge]);
}
