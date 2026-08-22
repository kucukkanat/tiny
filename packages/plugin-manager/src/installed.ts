import { compile } from "./compile.ts";
import { PluginManagerError } from "./errors.ts";
import { type HostModules, hostModules } from "./runtime.ts";

// Source lives in OPFS (reachable by the model's fs tools); the manifest in localStorage pins the SHA-256 the user approved — nothing runs unless its hash still matches.

/** The slice of `Storage` the manifest uses, so a test or script can supply its own. */
export type ManifestStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export type InstalledPlugin = {
  readonly id: string;
  readonly name: string;
  /** Set when the source was fetched, so it can be updated later. */
  readonly url?: string | undefined;
  /** SHA-256 of the source the user approved. */
  readonly sha256: string;
  readonly enabled: boolean;
  /** ISO timestamp of the install. */
  readonly addedAt: string;
};

/** `modified` and `missing` both mean "will not run until re-approved". */
export type SourceStatus = "ok" | "modified" | "missing";
export type InspectedPlugin = InstalledPlugin & { readonly status: SourceStatus };

export type InstallInput = {
  readonly name: string;
  readonly source: string;
  readonly url?: string | undefined;
};

export type InstalledOptions = {
  /** Defaults to the Origin Private File System root. */
  readonly root?: (() => Promise<FileSystemDirectoryHandle>) | undefined;
  /** Defaults to `localStorage`. */
  readonly manifest?: ManifestStorage | undefined;
  /** Stamped onto new entries; injectable so examples and tests stay stable. */
  readonly now?: (() => string) | undefined;
  /** Extra modules an installed plugin may `import` by name; see `runtime.ts`. */
  readonly modules?: HostModules | undefined;
};

const MANIFEST_KEY = "tiny:plugins";
const DIRECTORY = "plugins";

export const sha256 = async (source: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(source));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
};

/** Downloads a plugin's source. The response is text, never executed here. */
export const fetchSource = async (url: string): Promise<string> => {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new PluginManagerError(`Not a valid URL: ${url}`);
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
    throw new PluginManagerError(`Only http(s) URLs can be fetched, not ${parsed.protocol}`);

  const response = await fetch(parsed).catch((error: unknown) => {
    throw new PluginManagerError(`Could not reach ${url}: ${messageOf(error)}`);
  });
  if (!response.ok) throw new PluginManagerError(`${url} responded ${response.status}`);
  return response.text();
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const notFound = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "NotFoundError";

const originPrivateRoot = (): Promise<FileSystemDirectoryHandle> => {
  if (typeof navigator === "undefined" || navigator.storage?.getDirectory === undefined)
    return Promise.reject(
      new PluginManagerError("The Origin Private File System is unavailable; pass `root` instead"),
    );
  return navigator.storage.getDirectory();
};

const browserStorage = (): ManifestStorage => {
  if (typeof localStorage === "undefined")
    throw new PluginManagerError("localStorage is unavailable; pass `manifest` instead");
  return localStorage;
};

export type Installed = {
  /** What the manifest claims, without touching the disk. */
  list(): readonly InstalledPlugin[];
  /** The manifest, each entry checked against the source on disk. */
  inspect(): Promise<readonly InspectedPlugin[]>;
  /** Validates the source, writes it, and pins its hash. */
  install(input: InstallInput): Promise<InstalledPlugin>;
  /** Re-pins an entry from its URL; omitting `reviewed` fetches and applies code nobody saw. */
  update(id: string, reviewed?: string): Promise<InstalledPlugin>;
  setEnabled(id: string, enabled: boolean): void;
  remove(id: string): Promise<void>;
  /** The stored source, or a `PluginManagerError` if it no longer matches. */
  verifiedSource(entry: InstalledPlugin): Promise<string>;
};

export const openInstalled = (options: InstalledOptions = {}): Installed => {
  const root = options.root ?? originPrivateRoot;
  const storage = options.manifest ?? browserStorage();
  const now = options.now ?? (() => new Date().toISOString());
  const modules = hostModules(options.modules);

  const directory = async (create = false) =>
    (await root()).getDirectoryHandle(DIRECTORY, { create });

  const list = (): readonly InstalledPlugin[] => {
    const raw = storage.getItem(MANIFEST_KEY);
    if (raw === null) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as readonly InstalledPlugin[]) : [];
    } catch {
      // A corrupt manifest disables every plugin rather than guessing at it.
      console.error("[plugin-manager] the manifest is unreadable and was ignored");
      return [];
    }
  };

  const save = (manifest: readonly InstalledPlugin[]) =>
    storage.setItem(MANIFEST_KEY, JSON.stringify(manifest));

  const entry = (id: string): InstalledPlugin => {
    const found = list().find((candidate) => candidate.id === id);
    if (found === undefined) throw new PluginManagerError(`No installed plugin with id ${id}`);
    return found;
  };

  const readSource = async (id: string): Promise<string | undefined> => {
    try {
      const handle = await (await directory()).getFileHandle(`${id}.js`);
      return await (await handle.getFile()).text();
    } catch (error) {
      if (notFound(error)) return undefined;
      throw error;
    }
  };

  const writeSource = async (id: string, source: string) => {
    const handle = await (await directory(true)).getFileHandle(`${id}.js`, { create: true });
    const writable = await handle.createWritable();
    await writable.write(source);
    await writable.close();
  };

  const pin = async (input: InstallInput, id: string, enabled: boolean, addedAt: string) => {
    // Compile first, so invalid source is rejected before anything is written.
    await compile(input.source, modules);
    await writeSource(id, input.source);
    return {
      id,
      name: input.name,
      url: input.url,
      sha256: await sha256(input.source),
      enabled,
      addedAt,
    } satisfies InstalledPlugin;
  };

  return {
    list,

    inspect: async () =>
      Promise.all(
        list().map(async (installed) => {
          const source = await readSource(installed.id);
          const status: SourceStatus =
            source === undefined
              ? "missing"
              : (await sha256(source)) === installed.sha256
                ? "ok"
                : "modified";
          return { ...installed, status };
        }),
      ),

    install: async (input) => {
      const name = input.name.trim();
      if (name === "") throw new PluginManagerError("A plugin needs a name");
      if (input.source.trim() === "") throw new PluginManagerError("The source is empty");
      const installed = await pin({ ...input, name }, crypto.randomUUID(), true, now());
      save([...list(), installed]);
      return installed;
    },

    update: async (id, reviewed) => {
      const current = entry(id);
      if (current.url === undefined)
        throw new PluginManagerError(`"${current.name}" was pasted, so there is nothing to update`);
      // The reviewed source wins: re-fetching would apply code the user never approved.
      const source = reviewed ?? (await fetchSource(current.url));
      const refreshed = await pin(
        { name: current.name, source, url: current.url },
        current.id,
        current.enabled,
        current.addedAt,
      );
      save(list().map((candidate) => (candidate.id === id ? refreshed : candidate)));
      return refreshed;
    },

    setEnabled: (id, enabled) => {
      entry(id);
      save(
        list().map((candidate) => (candidate.id === id ? { ...candidate, enabled } : candidate)),
      );
    },

    remove: async (id) => {
      entry(id);
      save(list().filter((candidate) => candidate.id !== id));
      try {
        await (await directory()).removeEntry(`${id}.js`);
      } catch (error) {
        if (!notFound(error)) throw error;
      }
    },

    verifiedSource: async (installed) => {
      const source = await readSource(installed.id);
      if (source === undefined)
        throw new PluginManagerError(`"${installed.name}" has no source on disk`);
      if ((await sha256(source)) !== installed.sha256)
        throw new PluginManagerError(
          `"${installed.name}" no longer matches the source you approved`,
        );
      return source;
    },
  };
};
