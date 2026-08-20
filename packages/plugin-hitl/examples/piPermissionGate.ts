/**
 * Permission Gate Extension
 *
 * Prompts for confirmation before running potentially dangerous bash commands.
 * Patterns checked: rm -rf, sudo, chmod/chown 777
 *
 * This is pi's own `examples/extensions/permission-gate.ts`, from
 * `@earendil-works/pi-coding-agent`. The import on the next line is the only
 * edit: pi's `ExtensionAPI` becomes this host's `PluginAPI`. Everything below
 * it — the event, `event.input`, `ctx.hasUI`, `ctx.ui.select`, and the
 * `{ block, reason }` return — is pi's code, unchanged.
 */

import type { PluginAPI } from "@tiny/plugin";

export default function (pi: PluginAPI) {
  const dangerousPatterns = [/\brm\s+(-rf?|--recursive)/i, /\bsudo\b/i, /\b(chmod|chown)\b.*777/i];

  pi.on("tool_call", async (event, ctx) => {
    if (event.toolName !== "bash") return undefined;

    const command = event.input.command as string;
    const isDangerous = dangerousPatterns.some((p) => p.test(command));

    if (isDangerous) {
      if (!ctx.hasUI) {
        // In non-interactive mode, block by default
        return { block: true, reason: "Dangerous command blocked (no UI for confirmation)" };
      }

      const choice = await ctx.ui.select(`⚠️ Dangerous command:\n\n  ${command}\n\nAllow?`, [
        "Yes",
        "No",
      ]);

      if (choice !== "Yes") {
        return { block: true, reason: "Blocked by user" };
      }
    }

    return undefined;
  });
}
