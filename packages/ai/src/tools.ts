import type { Api, Model } from "@earendil-works/pi-ai";
import { type Infer, type JsonSchema, schemaProblems } from "./schema.ts";

/**
 * The tool contract: what a tool is, what it returns, and what it is handed.
 * pi's shapes, with the one deliberate difference noted on `ToolDefinition`.
 */

/** One block of tool output. pi carries more kinds; text is what a chat reads. */
export type ToolContent = { readonly type: "text"; readonly text: string };

/** What `execute` resolves to — pi's `ToolResult`. */
export type ToolResult = {
  /** Sent to the model. Blocks are joined with newlines. */
  readonly content: readonly ToolContent[];
  /** Structured payload for rendering and state; never sent to the model. */
  readonly details?: unknown;
  /**
   * Stop after this tool batch instead of asking the model again — honoured
   * only when every finalized result in the batch also sets it, as in pi.
   */
  readonly terminate?: boolean;
};

/** Progress a long-running tool pushes through `onUpdate`. */
export type ToolUpdate = {
  readonly content: readonly ToolContent[];
  readonly details?: unknown;
};

/**
 * A tool the model may call.
 *
 * pi's `ToolDefinition`, with one deliberate difference: `parameters` is a plain
 * JSON Schema object rather than a typebox `TSchema`. A typebox schema *is* a
 * JSON Schema object at runtime, so definitions port unchanged — and typebox
 * stays out of the browser bundle, which `packages/ai/README.md` "Browser notes"
 * explains is not optional here.
 *
 * The `execute` signature is pi's exactly, positional arguments and all, so a
 * tool written for pi runs here without being rewritten.
 */
export type ToolDefinition = {
  readonly name: string;
  /** Display name. Falls back to `name`. */
  readonly label?: string;
  /** Read by the model before it decides to call: say what it returns, and when. */
  readonly description: string;
  /** Appended to the system prompt when this tool is active. */
  readonly promptSnippet?: string;
  /** Extra system-prompt lines about when to prefer this tool. */
  readonly promptGuidelines?: readonly string[];
  readonly parameters: Record<string, unknown>;
  /** Last chance to repair arguments a model got subtly wrong. */
  prepareArguments?(args: Record<string, unknown>): Record<string, unknown>;
  /**
   * Runs the call. Throwing marks the result as an error and hands the message
   * back to the model, which can then correct itself rather than the turn
   * failing.
   */
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: ((update: ToolUpdate) => void) | undefined,
    ctx: ToolExecuteContext,
  ): Promise<ToolResult> | ToolResult;
};

/**
 * What a tool's `execute` receives as `ctx`. This, and nothing else.
 *
 * pi hands tools its `ExtensionContext` rather than the richer context commands
 * get, and so does `streamChat`. It is spelled out rather than left open on
 * purpose: an index signature here would let `ctx.storage.get(...)` compile in a
 * tool that then crashes at runtime, because no host puts `storage` on it. If
 * your tool needs more than this, capture it in the closure that built the tool.
 */
export type ToolExecuteContext = {
  readonly signal: AbortSignal | undefined;
  readonly model: Model<Api>;
};

/** The text of a result, as the model receives it. */
export const toolText = (result: ToolResult | ToolUpdate): string =>
  result.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

/** Wraps a plain string as pi's content-block shape. */
export const toolOutput = (text: string, rest: Omit<ToolResult, "content"> = {}): ToolResult => ({
  content: [{ type: "text", text }],
  ...rest,
});

/* ------------------------------------------------------------------ *
 * defineTool — the same tool, declared once
 * ------------------------------------------------------------------ */

/** What `defineTool`'s `execute` is handed: one object, every field named. */
export type ToolCall<Args> = {
  /** Checked against `parameters` before this runs, and typed from it. */
  readonly args: Args;
  readonly toolCallId: string;
  readonly signal: AbortSignal | undefined;
  /** Push progress from a long-running tool; absent when nobody is listening. */
  readonly onUpdate: ((update: ToolUpdate) => void) | undefined;
  readonly ctx: ToolExecuteContext;
};

export type ToolSpec<S extends JsonSchema> = {
  readonly name: string;
  /** Display name. Falls back to `name`. */
  readonly label?: string;
  /** Read by the model before it decides to call: say what it returns, and when. */
  readonly description: string;
  /** Appended to the system prompt when this tool is active. */
  readonly promptSnippet?: string;
  /** Extra system-prompt lines about when to prefer this tool. */
  readonly promptGuidelines?: readonly string[];
  /** The one declaration: sent to the model, inferred from, and validated against. */
  readonly parameters: S;
  /** Last chance to repair arguments a model got subtly wrong, before validation. */
  readonly prepareArguments?: (args: Record<string, unknown>) => Record<string, unknown>;
  execute(call: ToolCall<Infer<S>>): Promise<ToolResult> | ToolResult;
};

/**
 * A tool whose arguments are typed by the schema that describes them.
 *
 * `ToolDefinition` is pi's shape, and it costs a tool author two things pi pays
 * for elsewhere: `execute` takes five positional parameters, and `params` is
 * `Record<string, unknown>`, so every tool starts by re-deriving the schema it
 * just wrote — `plugin-fs` had a `text(args, key)` helper for exactly this. Two
 * copies of one decision, which is the failure LEAN_CODE §5 is about.
 *
 * So: one options object instead of five positions, `args` inferred from
 * `parameters`, and the same schema checked at runtime before `execute` is
 * called. A bad argument becomes an error result the model reads and can correct
 * — the same outcome as throwing, reached without the tool writing the check.
 *
 * ```ts
 * defineTool({
 *   name: "fs_read",
 *   description: "Read a text file.",
 *   parameters: {
 *     type: "object",
 *     properties: { path: { type: "string" } },
 *     required: ["path"],
 *   },
 *   // `args.path` is a string, and cannot not be.
 *   execute: async ({ args }) => toolOutput(await read(args.path)),
 * });
 * ```
 *
 * Returns a plain `ToolDefinition`, so the registry, `streamChat` and any pi
 * extension reading the tool list see no difference. `ToolDefinition` remains
 * public and unchanged for a tool ported from pi verbatim.
 */
export const defineTool = <const S extends JsonSchema>(spec: ToolSpec<S>): ToolDefinition => ({
  name: spec.name,
  ...(spec.label === undefined ? {} : { label: spec.label }),
  description: spec.description,
  ...(spec.promptSnippet === undefined ? {} : { promptSnippet: spec.promptSnippet }),
  ...(spec.promptGuidelines === undefined ? {} : { promptGuidelines: spec.promptGuidelines }),
  parameters: spec.parameters,
  ...(spec.prepareArguments === undefined ? {} : { prepareArguments: spec.prepareArguments }),
  execute: (toolCallId, params, signal, onUpdate, ctx) => {
    const problems = schemaProblems(spec.parameters, params);
    // Thrown, not returned: `streamChat` turns a throw into an error result and
    // hands the message back to the model, which is the path a hand-written
    // check already took. The difference is that nobody had to write it.
    if (problems.length > 0) throw new Error(problems.join("; "));
    return spec.execute({ args: params as Infer<S>, toolCallId, signal, onUpdate, ctx });
  },
});
