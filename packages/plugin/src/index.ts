export type { AppBridge } from "./context.ts";
export {
  usePluginContext,
  usePluginExtensions,
  usePluginHost,
  usePluginTools,
  useProvideApp,
} from "./context.ts";
export type {
  CommandEntry,
  ContributionEntry,
  Registry,
  ShortcutEntry,
  ToolEntry,
} from "./host.ts";
export { emptyRegistry, loadPlugins } from "./host.ts";
export { matchesKey } from "./keys.ts";
export { PluginHost } from "./PluginHost.tsx";
export { Slot, StatusBar, Widgets } from "./Slot.tsx";
export { identityTheme } from "./theme.ts";
export type {
  AutocompleteItem,
  CommandInfo,
  CommandOptions,
  Contribution,
  DialogOptions,
  KeyId,
  NotifyLevel,
  Plugin,
  PluginAPI,
  PluginChat,
  PluginContext,
  PluginMessage,
  PluginSettings,
  PluginStorage,
  PluginStreaming,
  PluginUIContext,
  ShortcutOptions,
  SlotName,
  SlotProps,
  ThemeLike,
  WidgetOptions,
  WidgetPlacement,
} from "./types.ts";
