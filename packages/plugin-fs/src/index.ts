import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";
import { fileSystemTools, type RootResolver } from "./tools.ts";

export { FsError } from "./paths.ts";
export type { RootResolver } from "./tools.ts";
export { fileSystemTools } from "./tools.ts";

export type FileSystemOptions = {
  /**
   * Where the sandbox lives. Defaults to the Origin Private File System root.
   * Pass your own to scope the tools to a subdirectory, or to run them against
   * an alternative implementation in tests.
   */
  readonly root?: RootResolver;
};

/** OPFS is per-origin and only reachable from a browser. */
const originPrivateRoot: RootResolver = () => {
  if (typeof navigator === "undefined" || navigator.storage?.getDirectory === undefined)
    return Promise.reject(
      new Error("The Origin Private File System is unavailable; pass `root` instead"),
    );
  return navigator.storage.getDirectory();
};

/**
 * Filesystem tools for the model, backed by the Origin Private File System.
 *
 * OPFS is sandboxed to this origin and invisible to the real disk, so the tools
 * run without confirmation unless a gate like `@tiny/plugin-hitl` is loaded (the chat app loads one): the worst they can reach is data this app wrote.
 *
 * ```ts
 * export const plugins: readonly Plugin[] = [fileSystem()];
 * ```
 */
export const fileSystem = (options: FileSystemOptions = {}): IdentifiedPlugin =>
  definePlugin("fileSystem", { needs: ["tools"] }, (tiny) => {
    const tools = fileSystemTools(options.root ?? originPrivateRoot);
    for (const tool of tools) tiny.registerTool(tool);
  });
