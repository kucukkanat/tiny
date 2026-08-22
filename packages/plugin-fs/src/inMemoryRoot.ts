// A real in-memory implementation of the slice of OPFS these tools use, shipped as `@tiny/plugin-fs/testing`.

type FileNode = { kind: "file"; data: string };
type DirNode = { kind: "directory"; children: Map<string, Node> };
type Node = FileNode | DirNode;

const missing = (name: string) => new DOMException(`${name} was not found`, "NotFoundError");
const mismatch = (name: string) =>
  new DOMException(`${name} is the wrong kind`, "TypeMismatchError");

class MemoryFile {
  readonly kind = "file" as const;
  constructor(
    readonly name: string,
    private readonly node: FileNode,
  ) {}

  getFile(): Promise<File> {
    return Promise.resolve(new File([this.node.data], this.name));
  }

  createWritable(): Promise<{ write(chunk: unknown): Promise<void>; close(): Promise<void> }> {
    // Truncates by default and commits on close — the real API's visibility rule.
    let buffer = "";
    const node = this.node;
    return Promise.resolve({
      write(chunk: unknown) {
        buffer += typeof chunk === "string" ? chunk : String(chunk);
        return Promise.resolve();
      },
      close() {
        node.data = buffer;
        return Promise.resolve();
      },
    });
  }
}

class MemoryDirectory {
  readonly kind = "directory" as const;
  constructor(
    readonly name: string,
    private readonly node: DirNode,
  ) {}

  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<MemoryDirectory> {
    const existing = this.node.children.get(name);
    if (existing !== undefined)
      return existing.kind === "directory"
        ? Promise.resolve(new MemoryDirectory(name, existing))
        : Promise.reject(mismatch(name));
    if (options?.create !== true) return Promise.reject(missing(name));
    const created: DirNode = { kind: "directory", children: new Map() };
    this.node.children.set(name, created);
    return Promise.resolve(new MemoryDirectory(name, created));
  }

  getFileHandle(name: string, options?: { create?: boolean }): Promise<MemoryFile> {
    const existing = this.node.children.get(name);
    if (existing !== undefined)
      return existing.kind === "file"
        ? Promise.resolve(new MemoryFile(name, existing))
        : Promise.reject(mismatch(name));
    if (options?.create !== true) return Promise.reject(missing(name));
    const created: FileNode = { kind: "file", data: "" };
    this.node.children.set(name, created);
    return Promise.resolve(new MemoryFile(name, created));
  }

  removeEntry(name: string, options?: { recursive?: boolean }): Promise<void> {
    const existing = this.node.children.get(name);
    if (existing === undefined) return Promise.reject(missing(name));
    if (existing.kind === "directory" && existing.children.size > 0 && options?.recursive !== true)
      return Promise.reject(new DOMException(`${name} is not empty`, "InvalidModificationError"));
    this.node.children.delete(name);
    return Promise.resolve();
  }

  async *entries(): AsyncGenerator<[string, MemoryDirectory | MemoryFile]> {
    for (const [name, child] of this.node.children)
      yield [
        name,
        child.kind === "directory" ? new MemoryDirectory(name, child) : new MemoryFile(name, child),
      ];
  }
}

/** A fresh empty filesystem, typed as the handle the tools expect. */
export const memoryRoot = (): FileSystemDirectoryHandle =>
  new MemoryDirectory("", {
    kind: "directory",
    children: new Map(),
  }) as unknown as FileSystemDirectoryHandle;
