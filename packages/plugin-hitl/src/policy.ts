/** What happens to one tool call. */
export type Decision = "allow" | "ask" | "deny";

/** The part of a `tool_call` event a policy reads. */
export type PendingCall = {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
};

/** Decisions the user chose to keep, by tool name. */
export type Remembered = Readonly<Record<string, Decision>>;

export type Policy = {
  /** Tools that run without asking. */
  readonly allow?: readonly string[] | undefined;
  /** Tools that never run. */
  readonly deny?: readonly string[] | undefined;
  /** Everything not named above. Defaults to `"ask"`. */
  readonly fallback?: Decision | undefined;
  /**
   * Decide one call with its arguments in hand — the shape pi's own
   * `permission-gate` and `protected-paths` examples use. Return `undefined` to
   * fall through to the lists.
   */
  readonly decide?: ((call: PendingCall) => Decision | undefined) | undefined;
};

/**
 * Resolve one call against the policy.
 *
 * Order, most binding first:
 *
 * 1. `decide()` — it is the only rule that sees the arguments, so it gets the
 *    first and last word.
 * 2. `deny` — a hard rule from whoever configured the plugin.
 * 3. what the user chose to remember.
 * 4. `allow`.
 * 5. `fallback`, which is `"ask"`.
 *
 * `deny` outranks a remembered `"allow"` on purpose: "always allow this" is a
 * shortcut through the questions, not a way past a rule someone else set.
 */
export const resolve = (policy: Policy, remembered: Remembered, call: PendingCall): Decision =>
  policy.decide?.(call) ??
  (policy.deny?.includes(call.toolName) === true
    ? "deny"
    : (remembered[call.toolName] ??
      (policy.allow?.includes(call.toolName) === true ? "allow" : (policy.fallback ?? "ask"))));

/** Remembering is per tool name, so a later choice replaces an earlier one. */
export const remember = (
  current: Remembered,
  toolName: string,
  decision: Decision,
): Remembered => ({ ...current, [toolName]: decision });

export const forget = (current: Remembered, toolName: string): Remembered =>
  Object.fromEntries(Object.entries(current).filter(([name]) => name !== toolName));
