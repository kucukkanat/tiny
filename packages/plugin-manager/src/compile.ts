import type { Plugin } from "@tiny/plugin";
import { PluginManagerError } from "./errors.ts";
import { defaultModules, type HostModules, hostModuleUrl } from "./runtime.ts";

// Imported dynamically so the ~47 KB compiler chunk is only downloaded at first compile.
const loadCompiler = async () => {
  const [sucrase, lexer] = await Promise.all([import("sucrase"), import("es-module-lexer")]);
  await lexer.init;
  return { transform: sucrase.transform, parse: lexer.parse };
};

let compiler: ReturnType<typeof loadCompiler> | undefined;

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/** Anything a browser can resolve on its own: a path, or a URL with a scheme. */
const resolvable = (specifier: string): boolean =>
  /^\.{0,2}\//.test(specifier) || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(specifier);

const relative = (specifier: string): boolean => specifier.startsWith(".");

/**
 * Strips types and JSX (a transform, not a typecheck) and rewrites bare
 * specifiers to host module shims — a blob URL has no package resolution.
 */
export const transpile = async (
  source: string,
  modules: HostModules = defaultModules,
): Promise<string> => {
  compiler ??= loadCompiler();
  const { transform, parse } = await compiler;

  let js: string;
  try {
    js = transform(source, {
      transforms: ["typescript", "jsx"],
      jsxRuntime: "automatic",
      jsxImportSource: "react",
      // The plugin runs in the browser that just compiled it; nothing to downlevel.
      disableESTransforms: true,
      production: true,
    }).code;
  } catch (error) {
    throw new PluginManagerError(`The source does not parse: ${messageOf(error)}`);
  }

  const [imports] = parse(js);

  let out = "";
  let cursor = 0;
  for (const imported of imports) {
    // A specifier only known at runtime; nothing to rewrite.
    if (imported.n === undefined) continue;
    if (resolvable(imported.n)) {
      if (!relative(imported.n)) continue;
      throw new PluginManagerError(
        `Cannot import "${imported.n}": a plugin is one file, and a blob URL has no directory for a relative path to resolve against. Bundle to a single module, or import from an absolute URL.`,
      );
    }

    const namespace = modules[imported.n];
    if (namespace === undefined)
      throw new PluginManagerError(
        `Cannot import "${imported.n}": a plugin may import ${Object.keys(modules)
          .map((name) => `"${name}"`)
          .join(", ")}, or an absolute URL.`,
      );

    const url = hostModuleUrl(imported.n, namespace);
    // A static import's range excludes the quotes; a dynamic one's includes them.
    out += js.slice(cursor, imported.s) + (imported.d === -1 ? url : JSON.stringify(url));
    cursor = imported.e;
  }
  return out + js.slice(cursor);
};

/**
 * Turns plugin source into a callable plugin via a blob-URL ES module. There is
 * no sandbox: the code runs with full page access — trust is decided in the manifest.
 */
export const compile = async (
  source: string,
  modules: HostModules = defaultModules,
): Promise<Plugin> => {
  const url = URL.createObjectURL(
    new Blob([await transpile(source, modules)], { type: "text/javascript" }),
  );
  try {
    const module: unknown = await import(/* @vite-ignore */ url).catch((error: unknown) => {
      throw new PluginManagerError(`The source is not a loadable module: ${messageOf(error)}`);
    });
    const factory = (module as { default?: unknown }).default;
    if (typeof factory !== "function")
      throw new PluginManagerError("A plugin module must `export default` a function");
    return factory as Plugin;
  } finally {
    URL.revokeObjectURL(url);
  }
};
