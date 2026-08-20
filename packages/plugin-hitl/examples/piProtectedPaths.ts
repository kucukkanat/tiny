/**
 * Protected Paths Extension
 *
 * Blocks write and edit operations to protected paths.
 * Useful for preventing accidental modifications to sensitive files.
 *
 * pi's own `examples/extensions/protected-paths.ts`, with the same two edits as
 * `piPermissionGate.ts`: the import, and the parameter's name. It needs no
 * dialog at all — a gate that decides on its own is still a gate.
 */

import type { PluginAPI } from "@tiny/plugin";

export default function (tiny: PluginAPI) {
  const protectedPaths = [".env", ".git/", "node_modules/"];

  tiny.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "write" && event.toolName !== "edit") {
      return undefined;
    }

    const path = event.input.path as string;
    const isProtected = protectedPaths.some((p) => path.includes(p));

    if (isProtected) {
      if (ctx.hasUI) {
        ctx.ui.notify(`Blocked write to protected path: ${path}`, "warning");
      }
      return { block: true, reason: `Path "${path}" is protected` };
    }

    return undefined;
  });
}
