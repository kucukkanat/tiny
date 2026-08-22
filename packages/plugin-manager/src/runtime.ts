import * as tinyPlugin from "@tiny/plugin";
import * as react from "react";
import * as reactJsxRuntime from "react/jsx-runtime";

/**
 * The modules an installed plugin may `import` by name; `compile` rewrites each
 * to a shim re-exporting the host's own namespace (two Reacts would break hooks).
 */
export type HostModules = Readonly<Record<string, object>>;

/**
 * What every host offers. `react/jsx-runtime` is required — the JSX transform
 * emits an import of it behind the author's back.
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

// Generated because export names are runtime keys; non-identifier names ride on the default export.
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
 * The URL to rewrite `specifier` to, cached per namespace. Never revoked — it
 * must stay resolvable for every plugin loaded later, and caching keeps module identity stable.
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

/** The defaults plus whatever a host adds; additive so `react/jsx-runtime` is never lost. */
export const hostModules = (extra: HostModules = {}): HostModules => ({
  ...defaultModules,
  ...extra,
});
