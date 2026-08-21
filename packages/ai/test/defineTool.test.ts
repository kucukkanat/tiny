import { describe, expect, test } from "bun:test";
import { endpointModel } from "../src/models.ts";
import { type Infer, schemaProblems } from "../src/schema.ts";
import { defineTool, type ToolExecuteContext, toolOutput, toolText } from "../src/tools.ts";

const ctx: ToolExecuteContext = {
  signal: undefined,
  model: endpointModel({ baseUrl: "https://example.test/v1", apiKey: "k" }, "m"),
};

/** Calls a tool the way `streamChat` does — positionally, through `ToolDefinition`. */
const call = (tool: ReturnType<typeof defineTool>, args: Record<string, unknown>) =>
  tool.execute("call-1", args, undefined, undefined, ctx);

describe("schemaProblems", () => {
  const schema = {
    type: "object",
    properties: {
      path: { type: "string" },
      depth: { type: "integer" },
      deep: { type: "boolean" },
      tags: { type: "array", items: { type: "string" } },
      mode: { enum: ["fast", "slow"] },
      nested: { type: "object", properties: { inner: { type: "number" } } },
    },
    required: ["path"],
  } as const;

  test("accepts a value that matches", () => {
    expect(
      schemaProblems(schema, {
        path: "/a",
        depth: 2,
        deep: true,
        tags: ["x"],
        mode: "fast",
        nested: { inner: 1.5 },
      }),
    ).toEqual([]);
  });

  test("names the field, what it wanted, and what it got", () => {
    expect(schemaProblems(schema, { path: 42 })).toEqual(['"path" must be a string, not number']);
  });

  test("reports a missing required field", () => {
    expect(schemaProblems(schema, {})).toEqual(['"path" is required']);
  });

  test("reports every problem, not just the first", () => {
    // One round trip per mistake is the alternative, and the model is the one
    // paying for it.
    expect(schemaProblems(schema, { path: 1, depth: "two", deep: "yes" })).toHaveLength(3);
  });

  test("separates an integer from a number", () => {
    expect(schemaProblems(schema, { path: "/a", depth: 1.5 })).toEqual([
      '"depth" must be an integer, not number',
    ]);
    expect(schemaProblems(schema, { path: "/a", nested: { inner: 1.5 } })).toEqual([]);
  });

  test("checks inside arrays and objects, and says where", () => {
    expect(schemaProblems(schema, { path: "/a", tags: ["ok", 3] })).toEqual([
      '"tags.1" must be a string, not number',
    ]);
    expect(schemaProblems(schema, { path: "/a", nested: { inner: "x" } })).toEqual([
      '"nested.inner" must be a number, not string',
    ]);
  });

  test("checks an enum by value", () => {
    expect(schemaProblems(schema, { path: "/a", mode: "medium" })).toEqual([
      '"mode" must be one of "fast", "slow"',
    ]);
  });

  test("treats an absent optional as fine and null as a value", () => {
    expect(schemaProblems(schema, { path: "/a" })).toEqual([]);
    expect(schemaProblems(schema, { path: null })).toEqual(['"path" must be a string, not null']);
  });

  test("passes anything under a keyword it does not model", () => {
    // Refusing would reject arguments the model was right to send. Not modelled
    // is not the same as invalid.
    expect(
      schemaProblems({ type: "object", properties: { x: { $ref: "#/d" } } }, { x: 1 }),
    ).toEqual([]);
  });
});

describe("defineTool", () => {
  const read = defineTool({
    name: "read",
    description: "Read a file",
    parameters: {
      type: "object",
      properties: { path: { type: "string" }, lines: { type: "integer" } },
      required: ["path"],
    },
    execute: ({ args }) => {
      // Typed from the schema: `path` is a string, `lines` is `number | undefined`.
      const suffix = args.lines === undefined ? "" : ` (${args.lines} lines)`;
      return toolOutput(`read ${args.path}${suffix}`);
    },
  });

  test("produces a plain ToolDefinition, so nothing downstream changes", () => {
    expect(read.name).toBe("read");
    expect(read.parameters).toEqual({
      type: "object",
      properties: { path: { type: "string" }, lines: { type: "integer" } },
      required: ["path"],
    });
    expect(typeof read.execute).toBe("function");
  });

  test("hands execute the validated arguments", async () => {
    expect(toolText(await call(read, { path: "/a.txt" }))).toBe("read /a.txt");
    expect(toolText(await call(read, { path: "/a.txt", lines: 3 }))).toBe("read /a.txt (3 lines)");
  });

  test("throws before execute when the arguments do not match", () => {
    // `streamChat` turns the throw into an error result the model reads, which
    // is the path a hand-written check already took.
    expect(() => call(read, { path: 7 })).toThrow('"path" must be a string');
    expect(() => call(read, {})).toThrow('"path" is required');
  });

  test("execute does not run at all when validation fails", () => {
    let ran = false;
    const tool = defineTool({
      name: "counted",
      description: "d",
      parameters: { type: "object", properties: { n: { type: "number" } }, required: ["n"] },
      execute: () => {
        ran = true;
        return toolOutput("ok");
      },
    });

    expect(() => call(tool, { n: "no" })).toThrow();
    expect(ran).toBe(false);
  });

  test("carries the optional fields through, and omits the ones not given", () => {
    const full = defineTool({
      name: "full",
      label: "Full",
      description: "d",
      promptSnippet: "snippet",
      promptGuidelines: ["prefer this"],
      parameters: { type: "object" },
      prepareArguments: (args) => args,
      execute: () => toolOutput("ok"),
    });
    expect(full.label).toBe("Full");
    expect(full.promptSnippet).toBe("snippet");
    expect(full.promptGuidelines).toEqual(["prefer this"]);
    expect(typeof full.prepareArguments).toBe("function");

    expect("label" in read).toBe(false);
    expect("prepareArguments" in read).toBe(false);
  });

  test("passes the call's id, signal and onUpdate through by name", async () => {
    const controller = new AbortController();
    const seen: unknown[] = [];
    const tool = defineTool({
      name: "echoes",
      description: "d",
      parameters: { type: "object" },
      execute: ({ toolCallId, signal, onUpdate, ctx: given }) => {
        seen.push(toolCallId, signal, typeof onUpdate, given.model.id);
        return toolOutput("ok");
      },
    });

    await tool.execute("call-9", {}, controller.signal, () => {}, ctx);

    expect(seen).toEqual(["call-9", controller.signal, "function", "m"]);
  });
});

describe("Infer", () => {
  // Type-level, asserted by compiling: a mismatch here fails `bun run typecheck`.
  test("required is required, optional is optional", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    } as const;
    const value: Infer<typeof schema> = { a: "x" };
    const both: Infer<typeof schema> = { a: "x", b: 1 };
    // @ts-expect-error — `a` is required.
    const missing: Infer<typeof schema> = { b: 1 };
    // @ts-expect-error — `a` is a string.
    const wrong: Infer<typeof schema> = { a: 1 };

    expect([value, both, missing, wrong]).toHaveLength(4);
  });

  test("reads enums, arrays and nesting", () => {
    const schema = {
      type: "object",
      properties: {
        mode: { enum: ["fast", "slow"] },
        tags: { type: "array", items: { type: "string" } },
        nested: { type: "object", properties: { inner: { type: "boolean" } }, required: ["inner"] },
      },
      required: ["mode", "tags", "nested"],
    } as const;
    const value: Infer<typeof schema> = { mode: "fast", tags: ["a"], nested: { inner: true } };
    // @ts-expect-error — "medium" is not one of the enum's members.
    const bad: Infer<typeof schema> = { mode: "medium", tags: [], nested: { inner: true } };

    expect([value, bad]).toHaveLength(2);
  });
});
