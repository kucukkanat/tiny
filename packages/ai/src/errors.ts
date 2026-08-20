/**
 * How this package reports failure.
 */

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
