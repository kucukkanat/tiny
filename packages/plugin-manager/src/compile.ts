import type { Plugin } from "@tiny/plugin";
import { PluginManagerError } from "./errors.ts";
import { defaultModules, type HostModules, hostModuleUrl } from "./runtime.ts";

/**
 * The compiler, fetched on first use.
 *
 * 47 KB gzipped between them, which is a lot to spend on every visit for
 * something most sessions never do. Imported dynamically so the bundler splits
 * it into its own chunk: a user with nothing installed never downloads it, and
 * one who has pays for it once, at the first `compile` — which is either app
 * startup or the moment the Plugins dialog is opened.
 */
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
 * TypeScript and JSX into a module a browser will import.
 *
 * Two separate problems, and only the first is about syntax. Sucrase strips the
 * types and expands the JSX — a transform, not a typecheck, so a plugin's types
 * are worth exactly what its author's editor made of them and nothing is
 * verified here. Then every bare specifier is rewritten to a generated module
 * that hands back the host's own instance, because a blob URL has no package
 * resolution and the page has no import map; see `runtime.ts`.
 *
 * Plain JavaScript passes through both steps unchanged, so nothing that
 * installed before this existed compiles differently now.
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
      // The plugin runs in the browser that just compiled it, so there is
      // nothing older to downlevel for; `?.` and class fields stay as written.
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
    // `import(someVariable)` — a specifier only known at runtime, so there is
    // nothing to rewrite. It resolves against the blob URL and will fail there
    // if it is bare, which is the same answer arrived at later.
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
 * Turns plugin source into a callable plugin.
 *
 * The compiled source is imported as a real ES module through a blob URL, so it
 * gets module scope, top-level await and `import` of anything the page can
 * reach — the same thing a bundled plugin gets. There is no sandbox here and
 * there cannot be one: a plugin renders React into the app and calls the same
 * APIs the app does. The trust decision happens before this is ever called, in
 * the manifest; see `installed.ts`.
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
    // The module is fully loaded by now, so the URL has done its job.
    URL.revokeObjectURL(url);
  }
};
