import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * The smallest useful plugin: one command.
 *
 * `definePlugin` gives it the id that namespaces `ctx.storage` and labels its
 * errors — declared rather than inferred, because a minifier erases function
 * names and this has to be the same in every build.
 */
export const greet = (): IdentifiedPlugin =>
  definePlugin("greet", (tiny) => {
    tiny.registerCommand("greet", {
      description: "Say hello",
      handler: (args, ctx) => {
        ctx.ui.notify(`Hello, ${args === "" ? "world" : args}`, "info");
      },
    });
  });
