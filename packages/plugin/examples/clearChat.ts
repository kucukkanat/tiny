import type { Plugin } from "@tiny/plugin";

/**
 * A command and a shortcut, with a confirmation before anything is lost.
 *
 * Every call here is pi's, with pi's signatures — this file would run
 * unmodified as a pi extension under `.pi/extensions/`.
 */
export const clearChat = (): Plugin =>
  function clearChat(pi) {
    pi.registerCommand("clear", {
      description: "Start a new conversation",
      handler: async (_args, ctx) => {
        if (ctx.chat.messages.length === 0) {
          ctx.ui.notify("Nothing to clear", "info");
          return;
        }
        const ok = await ctx.ui.confirm("Clear chat?", "This conversation will be left behind.");
        if (ok) ctx.navigate("/");
      },
    });

    // pi's modifier set is ctrl / shift / alt / super — there is no `mod`.
    pi.registerShortcut("ctrl+shift+backspace", {
      description: "Clear the conversation",
      handler: (ctx) => ctx.runCommand("clear"),
    });
  };
