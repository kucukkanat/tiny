# @tiny/plugin-fs

Filesystem tools for the model, backed by the browser's **Origin Private File System**.

Adds five tools the model can call — `fs_list`, `fs_read`, `fs_write`, `fs_edit`,
`fs_delete` — as a [`@tiny/plugin`](../plugin) plugin. Nothing in the app changes but one
line in the registry.

OPFS is sandboxed to the page's origin and invisible to the real disk, so the tools run
without confirmation: the worst they can reach is data this app wrote.

## Usage

Add it to the registry — `examples/register.ts`:

```ts
import { loadPlugins } from "@tiny/plugin";
import { fileSystem } from "@tiny/plugin-fs";

// Adding the plugin to the registry is the whole wiring: `loadPlugins` collects
// its tools, and `useChat` hands them to `streamChat` for the model to call.
const { tools } = await loadPlugins([fileSystem()]);

for (const tool of tools) console.log(`${tool.name} — ${tool.description.split(".")[0]}`);
```

In the chat app that is one entry in `apps/chat/src/plugins/index.ts`:

```ts
export const plugins: readonly Plugin[] = [fileSystem()];
```

## The tools

| Tool | Arguments | Notes |
| --- | --- | --- |
| `fs_list` | `path` | One line per entry; directories get a trailing `/`. Sorted. |
| `fs_read` | `path` | Returns the whole file. Empty files say so rather than returning nothing. |
| `fs_write` | `path`, `content` | Writes whole and creates missing parents. Replaces an existing file. |
| `fs_edit` | `path`, `old_text`, `new_text` | Replaces one exact snippet. `old_text` must occur **exactly once**. |
| `fs_delete` | `path` | Removes a file, or a directory and everything under it. |

Paths are POSIX-shaped and always relative to the root: a leading `/` is decoration, `.`
and `..` resolve, and `..` may not climb past the root.

Text only. OPFS stores bytes, but a tool result is a string, so binary files are out of
scope rather than silently mangled.

Every failure — a missing file, a bad argument, an ambiguous edit — comes back to the
model as an **error result rather than a thrown request**, so it can read the message and
correct itself instead of the turn dying.

All five in one run — `examples/tools-in-action.ts`:

```ts
import { toolText } from "@tiny/ai";
import { fileSystemTools } from "@tiny/plugin-fs";
import { memoryRoot } from "@tiny/plugin-fs/testing";

// In the browser the root is OPFS — `navigator.storage.getDirectory()`, which
// `fileSystem()` uses by default. Here it is the in-memory filesystem the
// package ships for tests, so this example runs anywhere.
const root = memoryRoot();
const tools = fileSystemTools(() => Promise.resolve(root));

// pi hands `execute` positional arguments and takes back content blocks;
// `toolText` is the text of those blocks, which is what the model reads.
const call = async (name: string, args: Record<string, unknown>) => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`no tool named ${name}`);
  return toolText(
    await tool.execute("example-1", args, undefined, undefined, { signal: undefined }),
  );
};

// Parent directories are created as needed.
console.log(await call("fs_write", { path: "/notes/todo.md", content: "buy milk\nwrite tests" }));
console.log(await call("fs_list", { path: "/notes" }));
console.log(await call("fs_read", { path: "/notes/todo.md" }));

// `old_text` has to match exactly once, so an ambiguous edit is refused rather
// than applied to the wrong line.
console.log(
  await call("fs_edit", { path: "/notes/todo.md", old_text: "buy milk", new_text: "buy oat milk" }),
);
console.log(await call("fs_read", { path: "/notes/todo.md" }));

console.log(await call("fs_delete", { path: "/notes" }));
```

## Confining the tools to a subdirectory

`root` is a resolver, so the sandbox can be narrowed — `examples/scoped-root.ts`:

```ts
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
```

## Testing against these tools

`@tiny/plugin-fs/testing` exports `memoryRoot()`, a real in-memory implementation of the
slice of OPFS the tools use. Neither Bun nor happy-dom provides
`navigator.storage.getDirectory()`, so a test needs a root of its own — the same
arrangement as `fake-indexeddb` elsewhere in this repo. It is an implementation, not a
stub: the tools are never replaced, only the filesystem they walk.

## Requirements

The model has to support tool calling, and the endpoint has to pass tools through.
Endpoints without tool support ignore them, and the tools simply never fire.

OPFS needs a browser context. Outside one, the default resolver reports
`The Origin Private File System is unavailable; pass \`root\` instead` rather than failing
obscurely.

## Test

```sh
bun test
```

Every example above is a real file under `examples/`, executed by the suite, and the
README is asserted to embed each one verbatim.
