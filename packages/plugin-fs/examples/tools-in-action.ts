import { endpointModel, toolText } from "@tiny/ai";
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
    await tool.execute("example-1", args, undefined, undefined, {
      signal: undefined,
      model: endpointModel({ baseUrl: "https://example.test/v1", apiKey: "" }, "test-model"),
    }),
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
