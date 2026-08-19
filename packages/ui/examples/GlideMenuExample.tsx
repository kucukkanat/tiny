import { GlideMenu } from "@tiny/ui";

const ACTIONS = ["Rename", "Duplicate", "Delete"] as const;

/**
 * One highlight glides between rows instead of each row lighting up on its own.
 * Rows opt in with `data-row`, and need `relative z-10` to sit above it.
 */
export function GlideMenuExample() {
  return (
    <GlideMenu className="flex w-48 flex-col p-1">
      {ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          data-row
          className="relative z-10 h-8 rounded-control px-2 text-left"
          onClick={() => console.log(action)}
        >
          {action}
        </button>
      ))}
    </GlideMenu>
  );
}
