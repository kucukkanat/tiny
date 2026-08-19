import { createContext, useContext, useEffect } from "react";
import type { Registry } from "./host.ts";
import { emptyRegistry } from "./host.ts";
import type {
  CommandInfo,
  PluginContext,
  PluginMessage,
  PluginSettings,
  PluginStreaming,
  WidgetPlacement,
} from "./types.ts";

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
};

export type HostValue = {
  readonly registry: Registry;
  readonly widgets: ReadonlyMap<string, Widget>;
  readonly statuses: ReadonlyMap<string, string>;
  readonly commands: readonly CommandInfo[];
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

/** The `@tiny/ai` extensions collected from the registry, for `useChat`. */
export function usePluginExtensions() {
  return usePluginHost().registry.extensions;
}

/** The tools plugins registered, for `useChat` to hand to `streamChat`. */
export function usePluginTools() {
  return usePluginHost().registry.tools;
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
