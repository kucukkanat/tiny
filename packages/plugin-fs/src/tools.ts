import { defineTool, type ToolDefinition, toolOutput } from "@tiny/ai";
import {
  directoryAt,
  display,
  FsError,
  fileAt,
  notFound,
  readFile,
  segments,
  writeFile,
} from "./paths.ts";

/** Resolves the root lazily so a page that never calls a tool never touches OPFS. */
export type RootResolver = () => Promise<FileSystemDirectoryHandle>;

const pathParam = {
  type: "string",
  description: "Absolute path inside the sandbox, e.g. /notes/todo.md",
} as const;

/**
 * The five filesystem tools, bound to a root.
 *
 * Text only: OPFS stores bytes, but a tool result is a string, so binary files
 * are out of scope rather than silently mangled.
 *
 * `defineTool` rather than a bare `ToolDefinition`, so `parameters` is the only
 * place these arguments are described. It used to be one of two: the schema
 * below for the model, and a `text(args, "path")` helper to get the same fact
 * past TypeScript, which received `Record<string, unknown>`. `args.path` is a
 * string here because the schema says so, and a call that disagrees never
 * reaches `execute` — it comes back to the model as an error naming the field.
 */
export const fileSystemTools = (root: RootResolver): readonly ToolDefinition[] => [
  defineTool({
    name: "fs_list",
    label: "List Directory",
    description:
      "List the entries of a directory. Returns one line per entry, marking directories with a trailing slash. Use this before reading when unsure what exists.",
    parameters: {
      type: "object",
      properties: { path: { ...pathParam, description: "Directory path; / is the root" } },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async ({ args }) => {
      const parts = segments(args.path);
      const dir = await directoryAt(await root(), parts);
      const lines: string[] = [];
      for await (const [name, handle] of dir.entries())
        lines.push(handle.kind === "directory" ? `${name}/` : name);
      lines.sort();
      return toolOutput(lines.length === 0 ? `${display(parts)} is empty` : lines.join("\n"), {
        // Structured alongside the text: the model reads `content`, a renderer
        // or a caller can use this without parsing lines back apart.
        details: { path: display(parts), entries: lines },
      });
    },
  }),

  defineTool({
    name: "fs_read",
    label: "Read File",
    description: "Read a text file and return its full contents.",
    parameters: {
      type: "object",
      properties: { path: pathParam },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async ({ args }) => {
      const content = await readFile(await root(), args.path);
      return toolOutput(content === "" ? "(the file is empty)" : content, {
        details: { path: args.path, characters: content.length },
      });
    },
  }),

  defineTool({
    name: "fs_write",
    label: "Write File",
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
    execute: async ({ args }) => {
      const parts = await writeFile(await root(), args.path, args.content);
      return toolOutput(`Wrote ${args.content.length} character(s) to ${display(parts)}`, {
        details: { path: display(parts), characters: args.content.length },
      });
    },
  }),

  defineTool({
    name: "fs_edit",
    label: "Edit File",
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
    execute: async ({ args }) => {
      // Emptiness is not a type, so it stays a check here — and it is the only
      // one left, which is the point.
      if (args.old_text === "") throw new FsError('"old_text" must not be empty');

      const handle = await root();
      const before = await readFile(handle, args.path);
      const first = before.indexOf(args.old_text);
      if (first === -1)
        throw new FsError(`old_text was not found in ${display(segments(args.path))}`);
      // Uniqueness is what makes a blind edit safe; a second match means the
      // model has to narrow the snippet rather than guess which one it meant.
      if (before.indexOf(args.old_text, first + 1) !== -1)
        throw new FsError(
          `old_text appears more than once in ${display(segments(args.path))}; include more context`,
        );

      const parts = await writeFile(
        handle,
        args.path,
        before.replace(args.old_text, args.new_text),
      );
      return toolOutput(`Edited ${display(parts)}`, { details: { path: display(parts) } });
    },
  }),

  defineTool({
    name: "fs_delete",
    label: "Delete",
    description: "Delete a file, or a directory and everything inside it. This cannot be undone.",
    parameters: {
      type: "object",
      properties: { path: pathParam },
      required: ["path"],
      additionalProperties: false,
    },
    execute: async ({ args }) => {
      const { parent, name, parts } = await fileAt(await root(), args.path);
      try {
        await parent.removeEntry(name, { recursive: true });
      } catch (error) {
        if (notFound(error)) throw new FsError(`No such file or directory: ${display(parts)}`);
        throw error;
      }
      return toolOutput(`Deleted ${display(parts)}`, { details: { path: display(parts) } });
    },
  }),
];
