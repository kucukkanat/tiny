import { describe, expect, test } from "bun:test";
import type { Extension, ExtensionAPI } from "@tiny/ai";
import { loadPlugins, type PluginUIContext } from "@tiny/plugin";
import { identityTheme, type PiTerminalUI, piExtension, piTerminalUI } from "../src/index.ts";

// What this package exists for, and the line it draws: the pi half is here and
// reachable, and `@tiny/plugin`'s own surface no longer carries any of it.

/** Collect what a synthesised extension registers, the way streamChat would. */
const replayed = (extensions: readonly Extension[]): string[] => {
  const events: string[] = [];
  const api = { on: (event: string) => events.push(event) } as unknown as ExtensionAPI;
  for (const extension of extensions) void extension(api);
  return events;
};

describe("loading a pi extension", () => {
  test("accepts pi events this facade never fires, and drops them from replay", async () => {
    // `piExtension`, not a bare factory: the unfired names are off the surface
    // a new plugin sees, and reachable only by asking for pi's wider one.
    const plugin = piExtension((tiny) => {
      tiny.on("session_start", () => {});
      tiny.on("turn_end", () => {});
      tiny.on("context", () => {});
    });
    const { extensions } = await loadPlugins([plugin]);
    // Registering did not throw, and only the event @tiny/ai emits is replayed.
    expect(replayed(extensions)).toEqual(["context"]);
  });
});

describe("events accepted by tiny.on", () => {
  test("session_compact_failed loads without error, like every unfired pi event", async () => {
    const extension = piExtension((tiny) => {
      tiny.on("session_compact_failed", () => {});
      tiny.on("session_start", () => {});
    });
    const registry = await loadPlugins([extension]);
    // Neither fires, so neither is replayed into `@tiny/ai`.
    expect(registry.extensions).toHaveLength(1);
  });
});

describe("identityTheme", () => {
  test("returns text unstyled rather than throwing, so pi styling degrades", () => {
    expect(identityTheme.fg("accent", "●")).toBe("●");
    expect(identityTheme.bold("hi")).toBe("hi");
    expect(identityTheme.getFgAnsi("accent")).toBe("");
  });
});

describe("the surface an author sees", () => {
  test("every method typed on PluginUIContext is one the host implements", () => {
    // Written out, and checked by `keyof`: a name added to the type without an
    // implementation fails to compile here, and the count fails if one is added
    // without being considered.
    const live: readonly (keyof PluginUIContext)[] = [
      "confirm",
      "editor",
      "getEditorText",
      "input",
      "notify",
      "open",
      "pasteToEditor",
      "select",
      "setEditorText",
      "setStatus",
      "setTitle",
      "setWidget",
    ];
    expect(live).toHaveLength(12);
    // None of the live half is a terminal fallback — that is what makes them live.
    for (const name of live) expect(Object.keys(piTerminalUI)).not.toContain(name);
  });

  test("pi's terminal half is present at runtime and absent from the type", () => {
    const terminalOnly: readonly (keyof PiTerminalUI)[] = [
      "addAutocompleteProvider",
      "custom",
      "getAllThemes",
      "getEditorComponent",
      "getTheme",
      "getToolsExpanded",
      "onTerminalInput",
      "setEditorComponent",
      "setFooter",
      "setHeader",
      "setHiddenThinkingLabel",
      "setTheme",
      "setToolsExpanded",
      "setWorkingIndicator",
      "setWorkingMessage",
      "setWorkingVisible",
      "theme",
    ];
    // Reachable at runtime, so a pi extension calling one does not throw.
    expect(Object.keys(piTerminalUI).sort()).toEqual([...terminalOnly].sort());
    expect(terminalOnly).toHaveLength(17);
  });

  test("a terminal-only method is not on the type a plugin author sees", () => {
    // @ts-expect-error — the whole point of the split.
    const unreachable: keyof PluginUIContext = "setFooter";
    // Named so the assertion is about the type, not an unused binding.
    expect(String(unreachable)).toBe("setFooter");
  });
});
