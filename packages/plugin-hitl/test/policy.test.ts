import { describe, expect, test } from "bun:test";
import { forget, type PendingCall, remember, resolve } from "../src/policy.ts";

const call = (toolName: string, input: Record<string, unknown> = {}): PendingCall => ({
  toolName,
  input,
});

describe("resolve", () => {
  test("asks by default, because that is the point", () => {
    expect(resolve({}, {}, call("fs_write"))).toBe("ask");
  });

  test("honours the allow and deny lists", () => {
    const policy = { allow: ["fs_read"], deny: ["fs_delete"] };
    expect(resolve(policy, {}, call("fs_read"))).toBe("allow");
    expect(resolve(policy, {}, call("fs_delete"))).toBe("deny");
    expect(resolve(policy, {}, call("fs_write"))).toBe("ask");
  });

  test("falls back to whatever the caller chose for the rest", () => {
    expect(resolve({ fallback: "allow" }, {}, call("anything"))).toBe("allow");
    expect(resolve({ fallback: "deny" }, {}, call("anything"))).toBe("deny");
  });

  test("a remembered answer outranks the allow list and the fallback", () => {
    expect(resolve({ fallback: "ask" }, { fs_write: "allow" }, call("fs_write"))).toBe("allow");
    expect(resolve({ allow: ["fs_write"] }, { fs_write: "deny" }, call("fs_write"))).toBe("deny");
  });

  test("a configured deny outranks a remembered allow", () => {
    // "Always allow this" is a shortcut through the questions, not a way past a
    // rule someone else set.
    expect(resolve({ deny: ["fs_delete"] }, { fs_delete: "allow" }, call("fs_delete"))).toBe(
      "deny",
    );
  });

  test("decide() wins outright, since it is the only rule that sees arguments", () => {
    const policy = {
      deny: ["fs_write"],
      decide: ({ input }: PendingCall) =>
        String(input.path).startsWith("/tmp/") ? ("allow" as const) : undefined,
    };
    expect(resolve(policy, {}, call("fs_write", { path: "/tmp/scratch" }))).toBe("allow");
    // Returning nothing falls through to the lists rather than deciding.
    expect(resolve(policy, {}, call("fs_write", { path: "/etc/passwd" }))).toBe("deny");
  });
});

describe("remember and forget", () => {
  test("keep one decision per tool, without mutating what they were given", () => {
    const first = remember({}, "fs_write", "allow");
    const second = remember(first, "fs_write", "deny");
    expect(first).toEqual({ fs_write: "allow" });
    expect(second).toEqual({ fs_write: "deny" });
  });

  test("forget removes just the one", () => {
    const both = remember(remember({}, "a", "allow"), "b", "deny");
    expect(forget(both, "a")).toEqual({ b: "deny" });
    expect(forget(both, "missing")).toEqual(both);
  });
});
