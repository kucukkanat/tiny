import type { ApiType } from "./apis.ts";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  readonly role: ChatRole;
  readonly content: string;
};

/** Connection details for one endpoint. */
export type Endpoint = {
  /** e.g. "https://api.openai.com/v1" — with or without trailing slash. */
  readonly baseUrl: string;
  readonly apiKey: string;
  /**
   * Which pi streaming implementation the endpoint speaks. Defaults to
   * `openai-completions`, so an endpoint that omits it behaves as it always did.
   */
  readonly api?: ApiType | undefined;
};

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
 * What a tool's `execute` receives as `ctx`. pi hands tools an
 * `ExtensionContext` rather than the richer command context, and the host that
 * owns the surrounding UI decides what that is — hence the open shape.
 */
export type ToolExecuteContext = {
  readonly signal: AbortSignal | undefined;
  readonly [key: string]: unknown;
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

/** What a tool call did, as the UI sees it. */
export type ToolStatus = "running" | "ok" | "error";

/** One incremental piece of a streamed reply. */
export type StreamDelta =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | {
      readonly kind: "tool";
      readonly id: string;
      readonly name: string;
      readonly status: ToolStatus;
      /** A one-line summary — the arguments while running, the result after. */
      readonly summary: string;
    };

/**
 * A failed request. `status` is set when the failure came from a response this
 * package reads itself (model listing). Streaming failures come back from pi-ai
 * with the status already folded into the message, so `status` is undefined there.
 */
export class ChatApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ChatApiError";
  }
}

/** `"401: bad key"` when the status is known, otherwise just the message. */
export const describeError = (error: unknown): string =>
  error instanceof ChatApiError && error.status !== undefined
    ? `${error.status}: ${error.message}`
    : error instanceof Error
      ? error.message
      : String(error);
