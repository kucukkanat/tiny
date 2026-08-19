import type { ToolDefinition } from "@tiny/ai";
import { directoryAt, display, FsError, fileAt, readFile, segments, writeFile } from "./opfs.ts";

/** Resolves the root lazily so a page that never calls a tool never touches OPFS. */
export type RootResolver = () => Promise<FileSystemDirectoryHandle>;

/**
 * Arguments arrive as whatever the model produced, so every field is checked
 * before use. A bad argument throws, which `streamChat` turns into an error
 * result — the model reads the message and can correct itself.
 */
const text = (args: Record<string, unknown>, key: string): string => {
  const value = args[key];
  if (typeof value !== "string") throw new FsError(`"${key}" must be a string`);
  return value;
};

const optionalText = (args: Record<string, unknown>, key: string, fallback: string): string => {
  const value = args[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "string") throw new FsError(`"${key}" must be a string`);
  return value;
};

const pathParam = {
  type: "string",
  description: "Absolute path inside the sandbox, e.g. /notes/todo.md",
} as const;

const notFoundEntry = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "NotFoundError";

/**
 * The five filesystem tools, bound to a root.
 *
 * Text only: OPFS stores bytes, but a tool result is a string, so binary files
 * are out of scope rather than silently mangled.
 */
export const fileSystemTools = (root: RootResolver): readonly ToolDefinition[] => [
  {
    name: "fs_list",
    description:
      "List the entries of a directory. Returns one line per entry, marking directories with a trailing slash. Use this before reading when unsure what exists.",
    parameters: {
      type: "object",
      properties: { path: { ...pathParam, description: "Directory path; / is the root" } },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const parts = segments(text(args, "path"));
      const dir = await directoryAt(await root(), parts);
      const lines: string[] = [];
      for await (const [name, handle] of dir.entries())
        lines.push(handle.kind === "directory" ? `${name}/` : name);
      lines.sort();
      return lines.length === 0 ? `${display(parts)} is empty` : lines.join("\n");
    },
  },

  {
    name: "fs_read",
    description: "Read a text file and return its full contents.",
    parameters: {
      type: "object",
      properties: { path: pathParam },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const content = await readFile(await root(), text(args, "path"));
      return content === "" ? "(the file is empty)" : content;
    },
  },

  {
    name: "fs_write",
    description:
      "Write a text file whole, creating it and any missing parent directories. Replaces the file if it already exists; use fs_edit to change part of one.",
    parameters: {
      type: "object",
      properties: {
        path: pathParam,
        content: { type: "string", description: "Full file contents" },
      },
      required: ["path", "content"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const content = optionalText(args, "content", "");
      const parts = await writeFile(await root(), text(args, "path"), content);
      return `Wrote ${content.length} character(s) to ${display(parts)}`;
    },
  },

  {
    name: "fs_edit",
    description:
      "Replace one exact snippet in a text file. old_text must appear exactly once, so include enough surrounding context to make it unique.",
    parameters: {
      type: "object",
      properties: {
        path: pathParam,
        old_text: { type: "string", description: "Exact text to replace; must occur exactly once" },
        new_text: { type: "string", description: "Replacement text" },
      },
      required: ["path", "old_text", "new_text"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const path = text(args, "path");
      const oldText = text(args, "old_text");
      const newText = optionalText(args, "new_text", "");
      if (oldText === "") throw new FsError('"old_text" must not be empty');

      const handle = await root();
      const before = await readFile(handle, path);
      const first = before.indexOf(oldText);
      if (first === -1) throw new FsError(`old_text was not found in ${display(segments(path))}`);
      // Uniqueness is what makes a blind edit safe; a second match means the
      // model has to narrow the snippet rather than guess which one it meant.
      if (before.indexOf(oldText, first + 1) !== -1)
        throw new FsError(
          `old_text appears more than once in ${display(segments(path))}; include more context`,
        );

      const parts = await writeFile(handle, path, before.replace(oldText, newText));
      return `Edited ${display(parts)}`;
    },
  },

  {
    name: "fs_delete",
    description: "Delete a file, or a directory and everything inside it. This cannot be undone.",
    parameters: {
      type: "object",
      properties: { path: pathParam },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async (args) => {
      const path = text(args, "path");
      const { parent, name, parts } = await fileAt(await root(), path);
      try {
        await parent.removeEntry(name, { recursive: true });
      } catch (error) {
        if (notFoundEntry(error)) throw new FsError(`No such file or directory: ${display(parts)}`);
        throw error;
      }
      return `Deleted ${display(parts)}`;
    },
  },
];
