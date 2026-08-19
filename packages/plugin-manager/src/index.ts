export { type ActivationResult, activate } from "./activate.ts";
export { compile } from "./compile.ts";
export { PluginManagerError } from "./errors.ts";
export { ManagerDialog } from "./Manager.tsx";
export { type PluginManagerOptions, pluginManager } from "./pluginManager.tsx";
export {
  createStore,
  fetchSource,
  type InspectedPlugin,
  type InstalledPlugin,
  type InstallInput,
  type ManifestStorage,
  type RootResolver,
  type SourceStatus,
  type Store,
  type StoreOptions,
  sha256,
} from "./store.ts";
