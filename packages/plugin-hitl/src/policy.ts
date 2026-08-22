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
  /** Decide one call with its arguments in hand; return `undefined` to fall through to the lists. */
  readonly decide?: ((call: PendingCall) => Decision | undefined) | undefined;
};

/**
 * Decide one call, most binding first: `decide()`, `deny`, remembered, `allow`,
 * `fallback`. `deny` outranks a remembered `"allow"` on purpose.
 */
export const decideCall = (policy: Policy, remembered: Remembered, call: PendingCall): Decision =>
  policy.decide?.(call) ??
  (policy.deny?.includes(call.toolName) === true
    ? "deny"
    : (remembered[call.toolName] ??
      (policy.allow?.includes(call.toolName) === true ? "allow" : (policy.fallback ?? "ask"))));

/** Remembering is per tool name, so a later choice replaces an earlier one. */
export const withDecision = (
  current: Remembered,
  toolName: string,
  decision: Decision,
): Remembered => ({ ...current, [toolName]: decision });

export const withoutDecision = (current: Remembered, toolName: string): Remembered =>
  Object.fromEntries(Object.entries(current).filter(([name]) => name !== toolName));
