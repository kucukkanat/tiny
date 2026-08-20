import type { Plugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

/**
 * Per-plugin storage and a composer button, together.
 *
 * `ctx.storage` is namespaced to this plugin, so nothing it writes can collide
 * with the app's own keys or with another plugin's.
 */
export const savedPrompts = (): Plugin => {
  function SaveButton() {
    const ctx = usePluginContext();

    return (
      <button
        type="button"
        data-testid="save-prompt"
        className="h-7 rounded-control px-1.5 text-sm text-ink-2 hover:bg-hover hover:text-ink"
        onClick={() => void ctx.runCommand("prompts")}
      >
        Prompts
      </button>
    );
  }

  return definePlugin("savedPrompts", (tiny) => {
    tiny.registerCommand("prompts", {
      description: "Insert a saved prompt",
      handler: async (_args, ctx) => {
        const saved = ctx.storage.get<string[]>("saved") ?? [
          "Explain this like I am five.",
          "Rewrite this more concisely.",
        ];
        const choice = await ctx.ui.select("Saved prompts", saved);
        if (choice !== undefined) ctx.ui.setEditorText(choice);
      },
    });

    tiny.registerCommand("prompts:add", {
      description: "Save a prompt for later",
      handler: async (args, ctx) => {
        const text = args !== "" ? args : await ctx.ui.input("Save a prompt", "Type it here");
        if (text === undefined || text === "") return;
        const saved = ctx.storage.get<string[]>("saved") ?? [];
        ctx.storage.set("saved", [...saved, text]);
        ctx.ui.notify("Saved", "info");
      },
    });

    tiny.contribute("composer.actions", SaveButton);
  });
};
