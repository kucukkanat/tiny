import { type ReactNode, useEffect, useState } from "react";
import { PluginBoundary } from "./Boundary.tsx";
import { usePluginHost } from "./hooks.ts";
import type { PanelEntry } from "./registry.ts";

/**
 * The app's right-hand rail, and the one surface that does not exist until a
 * plugin asks for it.
 *
 * With no panels registered this renders nothing at all — not an empty rail, not
 * a toggle for something that is not there — so an app that ships no panelled
 * plugin looks exactly as it did. One panel gives the rail a heading; several
 * give it a tab strip, in registration order.
 */
export function Panels() {
  const { registry } = usePluginHost();
  const { panels } = registry;
  const [state, setState] = useState<RailState>(readState);

  // Persisted so the rail survives a reload, the way a collapsed sidebar does.
  useEffect(() => writeState(state), [state]);

  if (panels.length === 0) return null;

  // The remembered panel can be gone — its plugin disabled, or removed by a
  // reload — in which case the rail falls back to the first rather than blanking.
  const active = panels.find((panel) => panel.id === state.activeId) ?? panels[0];
  if (active === undefined) return null;

  const show = (id: string) => setState({ collapsed: false, activeId: id });

  return (
    <aside
      aria-label="Panels"
      data-testid="plugin-panels"
      data-collapsed={state.collapsed}
      className="flex h-full shrink-0 flex-col overflow-hidden bg-canvas pb-2.5 transition-[width] duration-280"
      style={{
        width: state.collapsed ? COLLAPSED_WIDTH : PANEL_WIDTH,
        transitionTimingFunction: "var(--ease-out-strong)",
      }}
    >
      {state.collapsed ? (
        <div className="flex flex-col gap-px px-2 pt-1">
          {panels.map((panel) => (
            <button
              key={panel.id}
              type="button"
              title={panel.options.title}
              aria-label={`Open ${panel.options.title}`}
              data-testid={`plugin-panel-open-${panel.panelId}`}
              onClick={() => show(panel.id)}
              className={`${rowClass} h-8 justify-center`}
            >
              {iconOf(panel) ?? initialOf(panel)}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-2 flex h-10 shrink-0 items-center gap-1 px-2 pt-1">
            {panels.length === 1 ? (
              <span className="ml-1 min-w-0 flex-1 truncate text-md font-semibold text-ink">
                {active.options.title}
              </span>
            ) : (
              <div className="flex min-w-0 flex-1 gap-px overflow-x-auto">
                {panels.map((panel) => (
                  <button
                    key={panel.id}
                    type="button"
                    aria-current={panel.id === active.id}
                    data-testid={`plugin-panel-tab-${panel.panelId}`}
                    onClick={() => show(panel.id)}
                    className={`${rowClass} h-7 gap-1 px-2 text-smd font-medium ${
                      panel.id === active.id ? "bg-hover-2 text-ink" : "text-ink-2"
                    }`}
                  >
                    {iconOf(panel)}
                    <span className="truncate">{panel.options.title}</span>
                  </button>
                ))}
              </div>
            )}
            <button
              type="button"
              aria-label="Collapse panels"
              data-testid="plugin-panels-collapse"
              onClick={() => setState((current) => ({ ...current, collapsed: true }))}
              className={`${rowClass} size-8 shrink-0 justify-center text-ink-3`}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="M15 4v16" />
              </svg>
            </button>
          </div>

          <div
            className="min-h-0 flex-1 overflow-y-auto px-2"
            data-testid={`plugin-panel-${active.panelId}`}
          >
            <PluginBoundary pluginId={active.pluginId}>
              <active.options.component />
            </PluginBoundary>
          </div>
        </>
      )}
    </aside>
  );
}

const PANEL_WIDTH = 264;
const COLLAPSED_WIDTH = 52;

const rowClass =
  "flex items-center rounded-control transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink active:scale-[0.96]";

/** A panel's icon, if it declared one. */
const iconOf = (panel: PanelEntry): ReactNode =>
  panel.options.icon === undefined ? undefined : (
    <span className="flex size-4 items-center justify-center">{panel.options.icon}</span>
  );

/**
 * The title's initial, standing in for an icon a panel never declared.
 *
 * Only used in the collapsed rail, where there is no room for the title. Beside
 * a visible title it would render as "O Outline" — repeating the word rather
 * than identifying it.
 */
const initialOf = (panel: PanelEntry): ReactNode => (
  <span className="flex size-4 items-center justify-center text-sm font-semibold text-ink-2">
    {panel.options.title.slice(0, 1).toUpperCase()}
  </span>
);

/* ------------------------------------------------------------------ *
 * Which panel is open, and whether the rail is
 * ------------------------------------------------------------------ */

type RailState = { readonly collapsed: boolean; readonly activeId: string | undefined };

const STORAGE_KEY = "tiny-plugin:panels";
const closed: RailState = { collapsed: false, activeId: undefined };

const readState = (): RailState => {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw === null) return closed;
  try {
    const parsed = JSON.parse(raw) as Partial<RailState>;
    return {
      collapsed: parsed.collapsed === true,
      activeId: typeof parsed.activeId === "string" ? parsed.activeId : undefined,
    };
  } catch {
    // A preference, not data: an unreadable one is replaced rather than
    // reported, exactly as the host's own `storage.get` does.
    return closed;
  }
};

const writeState = (state: RailState) => localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
