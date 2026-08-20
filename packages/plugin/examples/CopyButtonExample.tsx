import type { Plugin } from "@tiny/plugin";
import { usePluginContext } from "@tiny/plugin";

/**
 * A button on every finished reply. `contribute` is the one part of the API pi
 * has no portable equivalent of — everything else here is pi's.
 */
export const copyButton = (): Plugin => {
  function CopyAction({ message }: { message?: { content: string } | undefined }) {
    const ctx = usePluginContext();
    if (message === undefined) return null;

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

  return (pi) => {
    pi.contribute("message.actions", CopyAction);
  };
};
