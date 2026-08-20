import { describe, expect, test } from "bun:test";
import { decideCall, type PendingCall, withDecision, withoutDecision } from "../src/policy.ts";

const call = (toolName: string, input: Record<string, unknown> = {}): PendingCall => ({
  toolName,
  input,
});

describe("resolve", () => {
  test("asks by default, because that is the point", () => {
    expect(decideCall({}, {}, call("fs_write"))).toBe("ask");
  });

  test("honours the allow and deny lists", () => {
    const policy = { allow: ["fs_read"], deny: ["fs_delete"] };
    expect(decideCall(policy, {}, call("fs_read"))).toBe("allow");
    expect(decideCall(policy, {}, call("fs_delete"))).toBe("deny");
    expect(decideCall(policy, {}, call("fs_write"))).toBe("ask");
  });

  test("falls back to whatever the caller chose for the rest", () => {
    expect(decideCall({ fallback: "allow" }, {}, call("anything"))).toBe("allow");
    expect(decideCall({ fallback: "deny" }, {}, call("anything"))).toBe("deny");
  });

  test("a remembered answer outranks the allow list and the fallback", () => {
    expect(decideCall({ fallback: "ask" }, { fs_write: "allow" }, call("fs_write"))).toBe("allow");
    expect(decideCall({ allow: ["fs_write"] }, { fs_write: "deny" }, call("fs_write"))).toBe(
      "deny",
    );
  });

  test("a configured deny outranks a remembered allow", () => {
    // "Always allow this" is a shortcut through the questions, not a way past a
    // rule someone else set.
    expect(decideCall({ deny: ["fs_delete"] }, { fs_delete: "allow" }, call("fs_delete"))).toBe(
      "deny",
    );
  });

  test("decide() wins outright, since it is the only rule that sees arguments", () => {
    const policy = {
      deny: ["fs_write"],
      decide: ({ input }: PendingCall) =>
        String(input.path).startsWith("/tmp/") ? ("allow" as const) : undefined,
    };
    expect(decideCall(policy, {}, call("fs_write", { path: "/tmp/scratch" }))).toBe("allow");
    // Returning nothing falls through to the lists rather than deciding.
    expect(decideCall(policy, {}, call("fs_write", { path: "/etc/passwd" }))).toBe("deny");
  });
});

describe("remember and withoutDecision", () => {
  test("keep one decision per tool, without mutating what they were given", () => {
    const first = withDecision({}, "fs_write", "allow");
    const second = withDecision(first, "fs_write", "deny");
    expect(first).toEqual({ fs_write: "allow" });
    expect(second).toEqual({ fs_write: "deny" });
  });

  test("withoutDecision removes just the one", () => {
    const both = withDecision(withDecision({}, "a", "allow"), "b", "deny");
    expect(withoutDecision(both, "a")).toEqual({ b: "deny" });
    expect(withoutDecision(both, "missing")).toEqual(both);
  });
});
