import { type ReactNode, useState } from "react";
import { GlideMenu } from "./GlideMenu.tsx";

export type SidebarChat = { readonly id: string; readonly title: string };

function Icon({ children, size = 17 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const rowClass = (active: boolean) =>
  `relative z-10 mx-2 flex h-8 items-center rounded-control px-2 text-left transition-[background-color,transform] duration-150 active:scale-[0.96] ${
    active ? "bg-hover-2" : ""
  }`;

/* Collapsible chat rail: new chat, history, settings. The collapsed state
 * keeps a 52px icon rail so the controls never jump. */
export function Sidebar({
  title,
  chats,
  activeId,
  onSelect,
  onNew,
  onDelete,
  onSettings,
  defaultCollapsed = false,
  footer,
}: {
  title: string;
  chats: readonly SidebarChat[];
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
  onSettings: () => void;
  defaultCollapsed?: boolean;
  /** Rendered below the settings row; the app fills this with a plugin slot. */
  footer?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);

  return (
    <aside
      aria-label="Chats"
      className="flex h-full shrink-0 flex-col overflow-hidden bg-canvas pb-2.5 transition-[width] duration-280"
      style={{ width: collapsed ? 52 : 224, transitionTimingFunction: "var(--ease-out-strong)" }}
    >
      <div className="mb-2 flex h-10 shrink-0 items-center justify-between px-2 pt-1">
        {!collapsed && (
          <span className="ml-2 truncate text-lg font-semibold text-ink">{title}</span>
        )}
        <button
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setCollapsed((current) => !current)}
          className="flex size-8 shrink-0 items-center justify-center rounded-control text-ink-3 transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-[0.96]"
        >
          <Icon>
            <rect x="3" y="4" width="18" height="16" rx="3" />
            <path d="M9 4v16" />
          </Icon>
        </button>
      </div>

      <GlideMenu
        className="flex flex-col gap-px"
        highlightClassName="inset-x-2 rounded-control bg-hover-2"
      >
        <button data-row type="button" onClick={onNew} className={rowClass(false)} title="New chat">
          <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
            <Icon>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </Icon>
          </span>
          {!collapsed && (
            <span className="ml-1.5 min-w-0 flex-1 truncate text-md font-medium text-ink-2">
              New chat
            </span>
          )}
        </button>
      </GlideMenu>

      {!collapsed && (
        <>
          <div className="mx-2 mt-3 flex h-7 items-center px-2 text-smd font-medium text-ink-3">
            Chats
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <GlideMenu
              className="flex flex-col gap-px"
              highlightClassName="inset-x-2 rounded-control bg-hover-2"
            >
              {chats.map((chat) => (
                <div key={chat.id} data-row className="group/chat relative z-10 mx-2 flex h-8">
                  <button
                    type="button"
                    title={chat.title}
                    onClick={() => onSelect(chat.id)}
                    className={`${rowClass(chat.id === activeId)} mx-0 min-w-0 flex-1`}
                  >
                    <span className="min-w-0 flex-1 truncate text-md font-medium text-ink-2">
                      {chat.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${chat.title}`}
                    onClick={() => onDelete(chat.id)}
                    className="absolute top-1 right-1 z-20 hidden size-6 items-center justify-center rounded-[6px] text-ink-3 transition-colors duration-100 hover:bg-hover hover:text-ink group-hover/chat:flex"
                  >
                    <Icon size={12}>
                      <path d="M18 6L6 18M6 6l12 12" />
                    </Icon>
                  </button>
                </div>
              ))}
              {chats.length === 0 && (
                <div className="mx-2 px-2 py-2 text-smd text-ink-3">No chats yet</div>
              )}
            </GlideMenu>
          </div>
        </>
      )}
      {collapsed && <div className="flex-1" />}

      <GlideMenu
        className="flex flex-col gap-px"
        highlightClassName="inset-x-2 rounded-control bg-hover-2"
      >
        <button
          data-row
          type="button"
          onClick={onSettings}
          className={rowClass(false)}
          title="Settings"
        >
          <span className="flex size-5 shrink-0 items-center justify-center text-ink-2">
            <Icon>
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </Icon>
          </span>
          {!collapsed && (
            <span className="ml-1.5 min-w-0 flex-1 truncate text-md font-medium text-ink-2">
              Settings
            </span>
          )}
        </button>
      </GlideMenu>
      {footer !== undefined && <div className="px-2 pt-1">{footer}</div>}
    </aside>
  );
}
