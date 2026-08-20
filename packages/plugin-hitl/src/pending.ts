import { createExternalStore } from "@tiny/plugin";
import type { Verdict } from "./ApprovalCard.tsx";
import type { PendingCall } from "./policy.ts";

/** One question waiting on the user, and the handler parked on the answer. */
export type Pending = {
  readonly call: PendingCall;
  readonly label: string | undefined;
  readonly rememberLabel: string | undefined;
  settle(verdict: Verdict | undefined): void;
};

/**
 * The one call awaiting an answer.
 *
 * A store rather than a dialog: the `tool_call` handler runs inside the request,
 * the card renders inside the reply, and neither can hand the other a promise.
 * The same shape `settings` uses for its overlay — an external store the
 * contributed component subscribes to with `useSyncExternalStore`.
 *
 * One at a time is not a limitation to design around: `streamChat` executes tool
 * calls in sequence, so a second question cannot exist while the first is open.
 */
export type PendingStore = {
  subscribe(listener: () => void): () => void;
  get(): Pending | undefined;
  /** Resolves when the user answers, or with `undefined` if the wait is cut short. */
  ask(
    request: Omit<Pending, "settle">,
    signal: AbortSignal | undefined,
  ): Promise<Verdict | undefined>;
};

export const createPendingStore = (): PendingStore => {
  const pending = createExternalStore<Pending | undefined>(undefined);

  return {
    subscribe: pending.subscribe,
    get: pending.get,
    ask: (request, signal) =>
      new Promise<Verdict | undefined>((resolve) => {
        // Stopping the reply has to take the card down with it, or the question
        // outlives the run it belonged to.
        const abort = () => {
          pending.set(undefined);
          resolve(undefined);
        };
        if (signal?.aborted === true) {
          resolve(undefined);
          return;
        }
        signal?.addEventListener("abort", abort, { once: true });

        pending.set({
          ...request,
          settle: (verdict) => {
            signal?.removeEventListener("abort", abort);
            pending.set(undefined);
            resolve(verdict);
          },
        });
      }),
  };
};
