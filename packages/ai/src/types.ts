export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  readonly role: ChatRole;
  readonly content: string;
};

/** Connection details for any OpenAI-compatible endpoint. */
export type Endpoint = {
  /** e.g. "https://api.openai.com/v1" — with or without trailing slash. */
  readonly baseUrl: string;
  readonly apiKey: string;
};

/**
 * A tool the model may call.
 *
 * `parameters` is a JSON Schema object describing the arguments. pi-ai types this
 * field as typebox's `TSchema`, but a typebox schema *is* a plain JSON Schema
 * object at runtime — so a literal works, and no typebox reaches the bundle.
 * (`packages/ai/README.md` "Browser notes" explains why that matters here.)
 */
export type ToolDefinition = {
  readonly name: string;
  readonly description: string;
  readonly parameters: Record<string, unknown>;
  /**
   * Runs the call. Returning a string is the whole contract; throwing marks the
   * result as an error and hands the message back to the model, which can then
   * correct itself rather than the turn failing.
   */
  execute(
    args: Record<string, unknown>,
    ctx: { readonly signal: AbortSignal | undefined },
  ): Promise<string> | string;
};

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
