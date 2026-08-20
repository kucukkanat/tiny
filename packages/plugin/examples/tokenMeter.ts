import type { Plugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * An event subscriber that draws with `setWidget`.
 *
 * Both halves are pi's: `pi.on` is the same subscription `@tiny/ai` extensions
 * already use, and `setWidget` carries plain string lines — all the RPC
 * protocol supports, and therefore all a portable pi extension can rely on.
 */
export const tokenMeter = (): Plugin =>
  definePlugin("tokenMeter", (pi) => {
    let total = 0;

    pi.on("message_end", (event, _ctx) => {
      total += event.message.usage.totalTokens;
    });

    pi.registerCommand("tokens", {
      description: "Show tokens used this session",
      handler: (_args, ctx) => {
        ctx.ui.setWidget("tokens", [`${total} tokens this session`], {
          placement: "aboveEditor",
        });
      },
    });

    pi.registerCommand("tokens:hide", {
      description: "Hide the token meter",
      handler: (_args, ctx) => ctx.ui.setWidget("tokens", undefined),
    });
  });
