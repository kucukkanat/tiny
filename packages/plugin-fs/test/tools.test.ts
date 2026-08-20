import { beforeEach, describe, expect, test } from "bun:test";
import { endpointModel, toolText } from "@tiny/ai";
import { loadPlugins } from "@tiny/plugin";
import { fileSystem, fileSystemTools } from "../src/index.ts";
import { memoryRoot } from "../src/inMemoryRoot.ts";
import { segments } from "../src/opfs.ts";

// Every test drives the real `execute` against a real in-memory filesystem —
// the tools are never stubbed, only the OPFS handle they walk is supplied.

let root: FileSystemDirectoryHandle;
let tools: ReturnType<typeof fileSystemTools>;

/** Runs a tool through pi's positional signature and returns the text the model sees. */
const call = async (name: string, args: Record<string, unknown>) => toolText(await raw(name, args));

/** The whole `ToolResult`, for the tests that care about `details`. */
const raw = (name: string, args: Record<string, unknown>) => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error(`no tool named ${name}`);
  return Promise.resolve(
    tool.execute("call-1", args, undefined, undefined, {
      signal: undefined,
      model: endpointModel({ baseUrl: "https://example.test/v1", apiKey: "" }, "test-model"),
    }),
  );
};

beforeEach(() => {
  root = memoryRoot();
  tools = fileSystemTools(() => Promise.resolve(root));
});

describe("paths", () => {
  test("ignores a leading slash and redundant segments", () => {
    expect(segments("/a/./b/")).toEqual(["a", "b"]);
    expect(segments("a//b")).toEqual(["a", "b"]);
  });

  test("resolves .. within the sandbox", () => {
    expect(segments("/a/b/../c")).toEqual(["a", "c"]);
  });

  test("refuses to climb past the root", () => {
    expect(() => segments("/a/../..")).toThrow("escapes the root");
  });
});

describe("fs_write and fs_read", () => {
  test("round-trips a file", async () => {
    await call("fs_write", { path: "/notes/todo.md", content: "buy milk" });
    expect(await call("fs_read", { path: "/notes/todo.md" })).toBe("buy milk");
  });

  test("creates missing parent directories", async () => {
    const result = await call("fs_write", { path: "/deep/nested/dir/file.txt", content: "hi" });
    expect(result).toContain("/deep/nested/dir/file.txt");
    expect(await call("fs_read", { path: "deep/nested/dir/file.txt" })).toBe("hi");
  });

  test("replaces an existing file whole rather than appending", async () => {
    await call("fs_write", { path: "/a.txt", content: "first" });
    await call("fs_write", { path: "/a.txt", content: "second" });
    expect(await call("fs_read", { path: "/a.txt" })).toBe("second");
  });

  test("says so when a file is empty, rather than returning nothing", async () => {
    await call("fs_write", { path: "/empty.txt", content: "" });
    expect(await call("fs_read", { path: "/empty.txt" })).toBe("(the file is empty)");
  });

  test("reports a missing file by path", async () => {
    expect(call("fs_read", { path: "/nope.txt" })).rejects.toThrow("No such file: /nope.txt");
  });

  test("rejects a non-string path", async () => {
    expect(call("fs_read", { path: 42 })).rejects.toThrow('"path" must be a string');
  });
});

describe("fs_list", () => {
  test("marks directories and sorts entries", async () => {
    await call("fs_write", { path: "/z.txt", content: "" });
    await call("fs_write", { path: "/a.txt", content: "" });
    await call("fs_write", { path: "/sub/inner.txt", content: "" });

    expect(await call("fs_list", { path: "/" })).toBe("a.txt\nsub/\nz.txt");
  });

  test("reports an empty directory", async () => {
    await call("fs_write", { path: "/sub/x.txt", content: "" });
    await call("fs_delete", { path: "/sub/x.txt" });
    expect(await call("fs_list", { path: "/sub" })).toBe("/sub is empty");
  });

  test("reports a missing directory by path", async () => {
    expect(call("fs_list", { path: "/ghost" })).rejects.toThrow("No such directory: /ghost");
  });
});

describe("fs_edit", () => {
  beforeEach(async () => {
    await call("fs_write", { path: "/a.txt", content: "one two three" });
  });

  test("replaces a unique snippet", async () => {
    await call("fs_edit", { path: "/a.txt", old_text: "two", new_text: "2" });
    expect(await call("fs_read", { path: "/a.txt" })).toBe("one 2 three");
  });

  test("deletes the snippet when new_text is empty", async () => {
    await call("fs_edit", { path: "/a.txt", old_text: " two", new_text: "" });
    expect(await call("fs_read", { path: "/a.txt" })).toBe("one three");
  });

  test("refuses an ambiguous snippet instead of guessing", async () => {
    await call("fs_write", { path: "/b.txt", content: "x marks x" });
    expect(call("fs_edit", { path: "/b.txt", old_text: "x", new_text: "y" })).rejects.toThrow(
      "appears more than once",
    );
    // The file is left untouched when the edit is refused.
    expect(await call("fs_read", { path: "/b.txt" })).toBe("x marks x");
  });

  test("reports a snippet that is not there", async () => {
    expect(call("fs_edit", { path: "/a.txt", old_text: "four", new_text: "4" })).rejects.toThrow(
      "was not found",
    );
  });

  test("rejects an empty old_text", async () => {
    expect(call("fs_edit", { path: "/a.txt", old_text: "", new_text: "x" })).rejects.toThrow(
      "must not be empty",
    );
  });
});

describe("fs_delete", () => {
  test("removes a file", async () => {
    await call("fs_write", { path: "/gone.txt", content: "x" });
    expect(await call("fs_delete", { path: "/gone.txt" })).toBe("Deleted /gone.txt");
    expect(call("fs_read", { path: "/gone.txt" })).rejects.toThrow("No such file");
  });

  test("removes a directory and everything in it", async () => {
    await call("fs_write", { path: "/tree/a/b.txt", content: "x" });
    await call("fs_delete", { path: "/tree" });
    expect(call("fs_list", { path: "/tree" })).rejects.toThrow("No such directory");
  });

  test("reports a missing entry", async () => {
    expect(call("fs_delete", { path: "/ghost" })).rejects.toThrow("No such file or directory");
  });
});

describe("the plugin", () => {
  test("registers all five tools under unique names", async () => {
    const { tools: registered } = await loadPlugins([
      fileSystem({ root: () => Promise.resolve(root) }),
    ]);
    expect(registered.map((tool) => tool.name).toSorted()).toEqual([
      "fs_delete",
      "fs_edit",
      "fs_list",
      "fs_read",
      "fs_write",
    ]);
  });

  test("describes every tool and its parameters, which is what the model reads", async () => {
    const { tools: registered } = await loadPlugins([
      fileSystem({ root: () => Promise.resolve(root) }),
    ]);
    for (const tool of registered) {
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.parameters).toMatchObject({ type: "object", required: expect.any(Array) });
    }
  });

  test("defaults to OPFS, and says so when it is unavailable", async () => {
    const { tools: registered } = await loadPlugins([fileSystem()]);
    const read = registered.find((tool) => tool.name === "fs_read");
    // Bun has no OPFS, so the default resolver reports rather than crashing oddly.
    expect(
      Promise.resolve(
        read?.execute("call-1", { path: "/a" }, undefined, undefined, {
          signal: undefined,
          model: endpointModel({ baseUrl: "https://example.test/v1", apiKey: "" }, "test-model"),
        }),
      ),
    ).rejects.toThrow("Origin Private File System is unavailable");
  });
});
