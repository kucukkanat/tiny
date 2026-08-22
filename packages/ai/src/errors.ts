/** A failed request. `status` is set only for responses this package reads itself
 * (model listing); streaming failures fold the status into the message. */
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
