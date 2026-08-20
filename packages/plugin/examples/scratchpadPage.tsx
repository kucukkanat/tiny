import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";
import { useState } from "react";

/**
 * A page of the plugin's own, at `/scratchpad`, listed in the app's navigation.
 *
 * `label` is what asks for that navigation row; a page without one is reached
 * from a command, a button, or `ctx.navigate` instead. Either way the page
 * replaces the thread and nothing else — the sidebar and the rail stay, so the
 * user is never somewhere with no way back.
 */
export const scratchpadPage = (): IdentifiedPlugin => {
  function Scratchpad() {
    const ctx = usePluginContext();
    // `ctx.storage` is namespaced to this plugin, so these notes outlive both
    // the conversation and the page without touching anything else's keys.
    const [text, setText] = useState(() => ctx.storage.get<string>("text") ?? "");

    return (
      <div className="mx-auto flex h-full w-full max-w-2xl flex-col gap-3 px-4 py-6">
        <h1 className="text-2xl font-semibold text-ink">Scratchpad</h1>
        <textarea
          data-testid="scratchpad"
          value={text}
          placeholder="Notes that outlive the conversation…"
          onChange={(event) => {
            setText(event.target.value);
            ctx.storage.set("text", event.target.value);
          }}
          className="min-h-0 flex-1 resize-none rounded-card bg-surface p-3 text-base text-ink shadow-hairline outline-none placeholder:text-ink-3"
        />
        <button
          type="button"
          data-testid="scratchpad-ask"
          onClick={() => ctx.chat.send(text)}
          className="h-8 self-start rounded-control bg-accent px-3 text-smd font-medium text-accent-ink"
        >
          Ask about this
        </button>
      </div>
    );
  }

  return definePlugin("scratchpadPage", (pi) => {
    pi.registerRoute("/scratchpad", { component: Scratchpad, label: "Scratchpad" });
  });
};
