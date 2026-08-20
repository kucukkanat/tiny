import * as tinyPlugin from "@tiny/plugin";
import * as react from "react";
import * as reactJsxRuntime from "react/jsx-runtime";

/**
 * The modules a plugin installed at runtime is allowed to `import` by name.
 *
 * A plugin is loaded as a blob module, and a blob URL has no package resolution
 * behind it: `import { useState } from "react"` is a bare specifier with nothing
 * to resolve against, and the page has no import map. So the specifiers a plugin
 * may write are exactly the keys of this record, and `compile` rewrites each one
 * to a generated module that re-exports the namespace given here.
 *
 * Re-exporting the host's *own* namespace is the point, not a convenience. Two
 * copies of React would each carry their own dispatcher, and a hook called from
 * a plugin's component would read the copy the renderer never wrote to — the
 * "invalid hook call" every dual-instance setup ends in. Handing back the very
 * object the app imported makes a plugin's `useState` the app's `useState`.
 */
export type HostModules = Readonly<Record<string, object>>;

/**
 * What every host offers: enough to write a typed, JSX-rendering plugin.
 *
 * `react/jsx-runtime` is here because it is not optional — the JSX transform
 * emits an import of it, so leaving it out would make every `.tsx` plugin fail
 * on a specifier its author never wrote. Anything beyond these three is the
 * host's call; see `pluginManager({ modules })`.
 */
export const defaultModules: HostModules = {
  react,
  "react/jsx-runtime": reactJsxRuntime,
  "@tiny/plugin": tinyPlugin,
};

/** Where the generated modules read their namespace back out of. */
const REGISTRY = "__tinyHostModules";

const identifier = /^[A-Za-z_$][\w$]*$/;

type Shim = { readonly namespace: object; readonly url: string };

const shims = new Map<string, Shim>();
let nextSlot = 0;

const registry = (): Record<string, object> => {
  const global = globalThis as Record<string, unknown>;
  const existing = global[REGISTRY];
  if (existing !== undefined) return existing as Record<string, object>;
  const created: Record<string, object> = {};
  global[REGISTRY] = created;
  return created;
};

/**
 * A module that re-exports a namespace already loaded in the page.
 *
 * It has to be generated rather than written, because the export names are the
 * runtime keys of the namespace — a module's exports are static syntax, so
 * there is no `export * from` a live object. Names that are not identifiers are
 * dropped: they cannot be imported by name anyway, and the default export still
 * carries the whole namespace for anyone who needs them.
 */
const shimSource = (slot: string, namespace: object): string => {
  const names = Object.keys(namespace).filter(
    (name) => name !== "default" && identifier.test(name),
  );
  return [
    `const m = globalThis[${JSON.stringify(REGISTRY)}][${JSON.stringify(slot)}];`,
    "export default m.default ?? m;",
    ...names.map((name) => `export const ${name} = m[${JSON.stringify(name)}];`),
  ].join("\n");
};

/**
 * The URL to rewrite `specifier` to, generated once per namespace.
 *
 * Deliberately never revoked, unlike the plugin's own blob URL in `compile`:
 * that one is imported once and done, while this one has to stay resolvable for
 * every plugin loaded later in the page's life. Caching also keeps module
 * identity stable — a fresh URL each time would give each plugin its own copy
 * of the shim, and `import`ing twice would stop being idempotent.
 */
export const hostModuleUrl = (specifier: string, namespace: object): string => {
  const cached = shims.get(specifier);
  if (cached?.namespace === namespace) return cached.url;

  const slot = `${specifier}#${nextSlot++}`;
  registry()[slot] = namespace;
  const url = URL.createObjectURL(
    new Blob([shimSource(slot, namespace)], { type: "text/javascript" }),
  );
  shims.set(specifier, { namespace, url });
  return url;
};

/**
 * The defaults plus whatever a host adds.
 *
 * Additive rather than replacing, because `react/jsx-runtime` is load-bearing —
 * a host offering its design system should not have to remember to re-list the
 * module the JSX transform emits behind the author's back. Idempotent, so a
 * caller that merges twice gets the same set.
 */
export const hostModules = (extra: HostModules = {}): HostModules => ({
  ...defaultModules,
  ...extra,
});
