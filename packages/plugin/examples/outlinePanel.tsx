import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

/**
 * A panel in the app's right-hand rail: every question asked so far, one click
 * from being asked again.
 *
 * The rail does not exist until a plugin registers a panel, so listing this
 * plugin is what makes the rail appear — and dropping it is what takes the rail
 * away again. Neither is an app change.
 */
export const outlinePanel = (): IdentifiedPlugin => {
  // Declared outside the factory, like any contributed component: React remounts
  // a component whose *type* changes identity, and a remount loses its state.
  function Outline() {
    const ctx = usePluginContext();
    const asked = ctx.chat.messages.flatMap((message, position) =>
      message.role === "user" ? [{ key: `${position}`, text: message.content }] : [],
    );

    if (asked.length === 0)
      return <p className="px-2 py-2 text-smd text-ink-3">Nothing asked yet.</p>;

    return (
      <ul className="flex flex-col gap-px py-1">
        {asked.map((entry) => (
          <li key={entry.key}>
            <button
              type="button"
              data-testid="outline-entry"
              title={entry.text}
              onClick={() => ctx.ui.setEditorText(entry.text)}
              className="w-full truncate rounded-control px-2 py-1.5 text-left text-smd text-ink-2 hover:bg-hover hover:text-ink"
            >
              {entry.text}
            </button>
          </li>
        ))}
      </ul>
    );
  }

  return definePlugin("outlinePanel", (tiny) => {
    tiny.registerPanel("outline", { title: "Outline", component: Outline });
  });
};
