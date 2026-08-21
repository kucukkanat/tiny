import type { IdentifiedPlugin, PropsOf } from "@tiny/plugin";
import { definePlugin, usePluginContext } from "@tiny/plugin";

/**
 * A button on every finished reply. `contribute` is the one part of the API pi
 * has no portable equivalent of — everything else here is pi's.
 *
 * `PropsOf<"message.actions">` is what that slot passes: a message and its
 * position, both always present. No hand-written prop type to drift from the
 * slot, and no null check for a value the slot guarantees.
 */
export const copyButton = (): IdentifiedPlugin => {
  function CopyAction({ message }: PropsOf<"message.actions">) {
    const ctx = usePluginContext();

    return (
      <button
        type="button"
        data-testid="copy-reply"
        className="rounded-control px-1.5 py-0.5 text-xs text-ink-3 hover:bg-hover hover:text-ink"
        onClick={() => {
          void navigator.clipboard?.writeText(message.content);
          ctx.ui.notify("Copied", "info");
        }}
      >
        Copy
      </button>
    );
  }

  return definePlugin("copyButton", (tiny) => {
    tiny.contribute("message.actions", CopyAction);
  });
};
