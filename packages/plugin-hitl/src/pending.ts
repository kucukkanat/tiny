import { createExternalStore, type ReadableStore } from "@tiny/plugin";
import type { Verdict } from "./inlineApproval.tsx";
import type { PendingCall } from "./policy.ts";

/** One question waiting on the user, and the handler parked on the answer. */
export type Pending = {
  readonly call: PendingCall;
  readonly label: string | undefined;
  readonly rememberLabel: string | undefined;
  settle(verdict: Verdict | undefined): void;
};

/**
 * The one call awaiting an answer. One at a time is safe: `streamChat` executes
 * tool calls in sequence, so a second question cannot exist while the first is open.
 */
export type PendingStore = ReadableStore<Pending | undefined> & {
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
        // Stopping the reply must take the card down, or the question outlives its run.
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
