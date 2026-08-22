// Path handling for OPFS. Paths are always relative to the given root; `..` may not climb past it.

/** A failure worth reporting to the model verbatim. */
export class FsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FsError";
  }
}

/** Splits a path into segments, resolving `.` and `..` without escaping. */
export const segments = (path: string): readonly string[] => {
  const resolved: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part !== "..") {
      resolved.push(part);
      continue;
    }
    if (resolved.length === 0) throw new FsError(`Path escapes the root: ${path}`);
    resolved.pop();
  }
  return resolved;
};

/** Renders segments back as an absolute path, for messages the model reads. */
export const display = (parts: readonly string[]): string => `/${parts.join("/")}`;

/** OPFS reports a missing entry by throwing, not by returning nothing. */
export const notFound = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "NotFoundError";

/** Walks to a directory, optionally creating each missing segment. */
export const directoryAt = async (
  root: FileSystemDirectoryHandle,
  parts: readonly string[],
  create = false,
): Promise<FileSystemDirectoryHandle> => {
  let dir = root;
  for (const [index, name] of parts.entries()) {
    try {
      dir = await dir.getDirectoryHandle(name, { create });
    } catch (error) {
      if (notFound(error))
        throw new FsError(`No such directory: ${display(parts.slice(0, index + 1))}`);
      throw error;
    }
  }
  return dir;
};

/** The parent directory and file name for a path, which must name a file. */
export const fileAt = async (
  root: FileSystemDirectoryHandle,
  path: string,
  create = false,
): Promise<{ parent: FileSystemDirectoryHandle; name: string; parts: readonly string[] }> => {
  const parts = segments(path);
  const name = parts.at(-1);
  if (name === undefined) throw new FsError("A file path is required");
  const parent = await directoryAt(root, parts.slice(0, -1), create);
  return { parent, name, parts };
};

/** Reads a file's text, reporting a missing file rather than throwing a DOMException. */
export const readFile = async (root: FileSystemDirectoryHandle, path: string): Promise<string> => {
  const { parent, name, parts } = await fileAt(root, path);
  try {
    const handle = await parent.getFileHandle(name);
    return await (await handle.getFile()).text();
  } catch (error) {
    if (notFound(error)) throw new FsError(`No such file: ${display(parts)}`);
    throw error;
  }
};

/** Writes a file whole, creating any missing parent directories. */
export const writeFile = async (
  root: FileSystemDirectoryHandle,
  path: string,
  content: string,
): Promise<readonly string[]> => {
  const { parent, name, parts } = await fileAt(root, path, true);
  const handle = await parent.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  try {
    await writable.write(content);
  } finally {
    await writable.close();
  }
  return parts;
};
