import { createContext, useContext, useEffect, useMemo } from "react";
import { createEvents, type PluginEvents } from "./events.ts";
import type { ProviderEntry } from "./providers.ts";
import type { MarkdownEntry, PanelEntry, PluginRuntime, RouteEntry } from "./registry.ts";
import { emptyRegistry, transformMarkdown } from "./registry.ts";
import type {
  CommandInfo,
  MarkdownContext,
  PluginContext,
  PluginMessage,
  PluginSettings,
  PluginStreaming,
  WidgetPlacement,
} from "./tiny.ts";

export type Widget = { readonly lines: readonly string[]; readonly placement: WidgetPlacement };

/** What the app publishes into the host; chat state lives in `App` and is pushed up. */
export type AppBridge = {
  readonly messages: readonly PluginMessage[];
  readonly streaming: PluginStreaming | undefined;
  readonly settings: PluginSettings | undefined;
  readonly signal: AbortSignal | undefined;
  send(text: string): void;
  stop(): void;
  updateSettings(next: PluginSettings): void;
  navigate(path: string): void;
  /** The current conversation's name, behind `tiny.getSessionName()`; optional because not every host names sessions. */
  readonly sessionName?: string | undefined;
  setSessionName?(name: string): void;
};

export type HostValue = {
  /** The live registry; `registry.dispose(pluginId)` disables one plugin without a reload. */
  readonly registry: PluginRuntime;
  /** False until the factories have finished, however they finished — gate fallback routes on it. */
  readonly ready: boolean;
  readonly widgets: ReadonlyMap<string, Widget>;
  readonly statuses: ReadonlyMap<string, string>;
  readonly commands: readonly CommandInfo[];
  /** Live, because pi allows registering a provider after the factory returns. */
  readonly providers: readonly ProviderEntry[];
  /** The tool names currently enabled — `tiny.getActiveTools()`. */
  readonly activeTools: readonly string[];
  /** The bus behind `tiny.events`. */
  readonly events: PluginEvents;
  /** The composer's draft. The host owns it; the composer is controlled by it. */
  readonly editorText: string;
  setEditorText(text: string): void;
  runCommand(name: string, args?: string): Promise<void>;
  contextFor(pluginId: string): PluginContext;
  publish(bridge: AppBridge): void;
};

const noop = () => {};

export const HostContext = createContext<HostValue>({
  registry: emptyRegistry,
  ready: false,
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

/** The `PluginContext` for the calling contribution, namespaced to the contributing plugin. */
export function usePluginContext(): PluginContext {
  const host = usePluginHost();
  return host.contextFor(useContext(PluginIdContext));
}

/** What to hand `streamChat` as its `extensions` — 0-2 entries regardless of plugin count. */
export function usePluginExtensions() {
  return usePluginHost().registry.extensions;
}

/** The tools plugins registered, minus any that `tiny.setActiveTools` switched off. */
export function usePluginTools() {
  const { registry, activeTools } = usePluginHost();
  return useMemo(
    () => registry.tools.filter((tool) => activeTools.includes(tool.name)),
    [registry, activeTools],
  );
}

/** The right-rail panels plugins registered, in tab order. Empty means no rail. */
export function usePluginPanels(): readonly PanelEntry[] {
  return usePluginHost().registry.panels;
}

/** The pages plugins registered; only entries with a `label` want a navigation link. */
export function usePluginRoutes(): readonly RouteEntry[] {
  return usePluginHost().registry.routes;
}

/** The endpoints plugins registered with `tiny.registerProvider`. */
export function usePluginProviders(): readonly ProviderEntry[] {
  return usePluginHost().providers;
}

/** The bus behind `tiny.events`, for a component that wants to join in. */
export function usePluginEvents(): PluginEvents {
  return usePluginHost().events;
}

/** Runs the registered markdown transformers over one message, re-rendering when they change. */
export function useMarkdown(markdown: string, context: MarkdownContext): string {
  const entries: readonly MarkdownEntry[] = usePluginHost().registry.markdown;
  return useMemo(
    () => (entries.length === 0 ? markdown : transformMarkdown(entries, markdown, context)),
    [entries, markdown, context],
  );
}

/** Called once by `App` to publish live chat state into the host.
 * Memoise the bridge's fields — a per-render identity re-renders the host in a loop. */
export function useProvideApp(bridge: AppBridge): void {
  const { publish } = usePluginHost();
  useEffect(() => publish(bridge), [publish, bridge]);
}
