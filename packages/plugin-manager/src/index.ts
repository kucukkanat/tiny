export { type ActivationResult, activate } from "./activate.ts";
export { compile } from "./compile.ts";
export { PluginManagerError } from "./errors.ts";
export {
  fetchSource,
  type InspectedPlugin,
  type Installed,
  type InstalledOptions,
  type InstalledPlugin,
  type InstallInput,
  type ManifestStorage,
  openInstalled,
  type SourceStatus,
  sha256,
} from "./installed.ts";
export { ManagerDialog } from "./ManagerDialog.tsx";
export { type PluginManagerOptions, pluginManager } from "./plugin.tsx";
