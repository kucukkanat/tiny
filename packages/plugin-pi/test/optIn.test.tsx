import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render } from "@testing-library/react";
import { definePlugin, type PluginContext, PluginHost, usePluginHost } from "@tiny/plugin";
import { piTerminalUI } from "../src/index.ts";

// The opt-in is the point: these seventeen methods used to be on `ctx.ui` in
// every app whether or not it ran a single pi extension.

afterEach(() => {
  cleanup();
  host = undefined;
});

type Host = ReturnType<typeof usePluginHost>;
let host: Host | undefined;
/** Read through a call, so narrowing does not decide it is always undefined. */
const mounted = (): Host | undefined => host;

function Probe() {
  host = usePluginHost();
  return null;
}

const contextIn = async (uiFallbacks?: Readonly<Record<string, unknown>>) => {
  host = undefined;
  await act(async () => {
    render(
      <PluginHost plugins={[definePlugin("probe", () => {})]} uiFallbacks={uiFallbacks}>
        <Probe />
      </PluginHost>,
    );
  });
  const live = mounted();
  if (live === undefined) throw new Error("the host did not mount");
  return live.contextFor("probe") as PluginContext & { ui: Record<string, unknown> };
};

describe("uiFallbacks", () => {
  test("without it, a method this host cannot implement is simply not there", async () => {
    const ctx = await contextIn();

    expect(ctx.ui.setFooter).toBeUndefined();
    expect(ctx.ui.onTerminalInput).toBeUndefined();
    expect(ctx.ui.theme).toBeUndefined();
    // And everything that does work still does.
    expect(typeof ctx.ui.notify).toBe("function");
    expect(typeof ctx.ui.getEditorText).toBe("function");
  });

  test("with it, pi's terminal half is present and returns pi's RPC answers", async () => {
    const ctx = await contextIn(piTerminalUI);

    expect(typeof ctx.ui.setFooter).toBe("function");
    expect((ctx.ui.getToolsExpanded as () => boolean)()).toBe(false);
    expect((ctx.ui.getAllThemes as () => unknown[])()).toEqual([]);
    expect((ctx.ui.setTheme as () => { success: boolean })().success).toBe(false);
    // A no-op unsubscribe, not undefined: a pi extension calls what it gets back.
    expect(typeof (ctx.ui.onTerminalInput as () => () => void)()).toBe("function");
  });

  test("it cannot shadow a method the host really implements", async () => {
    const ctx = await contextIn({ ...piTerminalUI, notify: () => "hijacked" });

    // Spread before the real ones, so the host always wins. An adapter is for
    // filling gaps, not for replacing behaviour other plugins depend on.
    expect((ctx.ui.notify as (m: string) => unknown)("hi")).toBeUndefined();
  });
});
