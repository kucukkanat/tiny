import type { Api, Model } from "@earendil-works/pi-ai";
import { type Infer, type JsonSchema, schemaProblems } from "./schema.ts";

/** One block of tool output. pi carries more kinds; text is what a chat reads. */
export type ToolContent = { readonly type: "text"; readonly text: string };

/** What `execute` resolves to — pi's `ToolResult`. */
export type ToolResult = {
  /** Sent to the model. Blocks are joined with newlines. */
  readonly content: readonly ToolContent[];
  /** Structured payload for rendering and state; never sent to the model. */
  readonly details?: unknown;
  /** Stop after this batch — honoured only when every result in the batch sets it, as in pi. */
  readonly terminate?: boolean;
};

/** Progress a long-running tool pushes through `onUpdate`. */
export type ToolUpdate = {
  readonly content: readonly ToolContent[];
  readonly details?: unknown;
};

/** A tool the model may call — pi's `ToolDefinition`, except `parameters` is plain
 * JSON Schema (not typebox) so typebox stays out of the browser bundle. */
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
  /** Runs the call. Throwing marks the result as an error the model reads and can correct. */
  execute(
    toolCallId: string,
    params: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onUpdate: ((update: ToolUpdate) => void) | undefined,
    ctx: ToolExecuteContext,
  ): Promise<ToolResult> | ToolResult;
};

/** What `execute` receives as `ctx` — deliberately closed: a tool needing more
 * must capture it in the closure that built the tool. */
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

/** Declare a tool once: `args` is typed by `parameters` and validated against it before
 * `execute` runs. Returns a plain `ToolDefinition`, indistinguishable to the host. */
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
    // Thrown: `streamChat` turns a throw into an error result for the model.
    if (problems.length > 0) throw new Error(problems.join("; "));
    return spec.execute({ args: params as Infer<S>, toolCallId, signal, onUpdate, ctx });
  },
});
