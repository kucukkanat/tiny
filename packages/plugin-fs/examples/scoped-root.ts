import { loadPlugins } from "@tiny/plugin";
import { fileSystem } from "@tiny/plugin-fs";
import { memoryRoot } from "@tiny/plugin-fs/testing";

// The root is a resolver, so the tools can be confined to a subdirectory. In a
// browser that would be:
//
//   const opfs = await navigator.storage.getDirectory();
//   return opfs.getDirectoryHandle("workspace", { create: true });
//
// Either way `/notes/todo.md` for the model lands under /workspace on disk.
const disk = memoryRoot();
const workspace = () => disk.getDirectoryHandle("workspace", { create: true });

const { tools } = await loadPlugins([fileSystem({ root: workspace })]);
const write = tools.find((tool) => tool.name === "fs_write");
// pi's positional signature: (toolCallId, params, signal, onUpdate, ctx).
await write?.execute(
  "example-1",
  { path: "/notes/todo.md", content: "buy milk" },
  undefined,
  undefined,
  {
    signal: undefined,
  },
);

// Read back from outside the sandbox to show where the file actually landed.
const notes = await (await disk.getDirectoryHandle("workspace")).getDirectoryHandle("notes");
const file = await (await notes.getFileHandle("todo.md")).getFile();
console.log(`/workspace/notes/todo.md → ${await file.text()}`);
