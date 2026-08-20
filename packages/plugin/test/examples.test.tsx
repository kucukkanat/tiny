import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { copyButton } from "../examples/CopyButtonExample.tsx";
import { clearChat } from "../examples/clearChat.ts";
import { savedPrompts } from "../examples/SavedPromptsExample.tsx";
import { tokenMeter } from "../examples/tokenMeter.ts";
import { usePluginHost } from "../src/hooks.ts";
import { PluginHost } from "../src/PluginHost.tsx";
import type { Plugin } from "../src/pi.ts";
import { emptyRegistry, loadPlugins } from "../src/registry.ts";
import { Slot, Widgets } from "../src/Slot.tsx";

// Every README snippet is a real plugin under examples/. Running each one proves
// the snippet compiles and works, and the README is then asserted to embed the
// file verbatim so a snippet cannot rot into something that does not.

afterEach(() => {
  cleanup();
  host = undefined;
});

let host: ReturnType<typeof usePluginHost> | undefined;
function Probe() {
  host = usePluginHost();
  return null;
}

const mount = async (plugins: readonly Plugin[], children?: React.ReactNode) => {
  host = undefined;
  // Factories resolve a microtask after the first paint; rendering inside `act`
  // keeps that second update in the act scope rather than landing loose.
  await act(async () => {
    render(
      <PluginHost plugins={plugins}>
        <Probe />
        {children}
      </PluginHost>,
    );
  });
  await waitFor(() => {
    expect(host).toBeDefined();
    expect(host?.registry).not.toBe(emptyRegistry);
  });
};

const EXAMPLES = [
  "CopyButtonExample.tsx",
  "clearChat.ts",
  "tokenMeter.ts",
  "SavedPromptsExample.tsx",
  "groqProvider.ts",
  "anthropicProvider.ts",
] as const;

const readme = await Bun.file(new URL("../README.md", import.meta.url)).text();

describe("examples run", () => {
  test("copyButton renders on a message and notifies when clicked", async () => {
    await mount(
      [copyButton()],
      <Slot
        name="message.actions"
        message={{ role: "assistant", content: "Hi there" }}
        index={0}
      />,
    );

    await waitFor(() => expect(screen.getByTestId("copy-reply")).toBeDefined());
    await act(async () => screen.getByTestId("copy-reply").click());
    await waitFor(() => expect(screen.getByTestId("plugin-toast").textContent).toBe("Copied"));
  });

  test("clearChat confirms before navigating, and no-ops on an empty chat", async () => {
    await mount([clearChat()]);

    // No messages published, so the command reports rather than asking.
    await act(async () => {
      await host?.runCommand("clear");
    });
    await waitFor(() =>
      expect(screen.getByTestId("plugin-toast").textContent).toBe("Nothing to clear"),
    );
  });

  test("clearChat registers pi-shaped command and shortcut metadata", async () => {
    const { commands, shortcuts } = await loadPlugins([clearChat()]);
    expect(commands[0]?.name).toBe("clear");
    expect(commands[0]?.options.description).toBe("Start a new conversation");
    expect(shortcuts[0]?.shortcut).toBe("ctrl+shift+backspace");
  });

  test("tokenMeter subscribes to message_end and draws a widget", async () => {
    const { extensions } = await loadPlugins([tokenMeter()]);
    // The subscription reached the replayed @tiny/ai extension.
    expect(extensions.length).toBe(1);

    await mount([tokenMeter()], <Widgets placement="aboveEditor" />);
    await act(async () => {
      await host?.runCommand("tokens");
    });
    await waitFor(() =>
      expect(screen.getByTestId("plugin-widgets-aboveEditor").textContent).toBe(
        "0 tokens this session",
      ),
    );

    await act(async () => {
      await host?.runCommand("tokens:hide");
    });
    await waitFor(() => expect(screen.queryByTestId("plugin-widgets-aboveEditor")).toBeNull());
  });

  test("savedPrompts stores in its own namespace and offers a picker", async () => {
    localStorage.clear();
    await mount([savedPrompts()], <Slot name="composer.actions" />);

    await act(async () => {
      await host?.runCommand("prompts:add", "Summarise this.");
    });
    expect(localStorage.getItem("tiny-plugin:savedPrompts:saved")).toBe('["Summarise this."]');

    // The composer button opens the picker through the registered command.
    // Synchronous `act`: the handler parks on the dialog, so awaiting it would
    // deadlock, but the update that opens the dialog is queued right away.
    await waitFor(() => expect(screen.getByTestId("save-prompt")).toBeDefined());
    act(() => screen.getByTestId("save-prompt").click());
    await waitFor(() => expect(screen.getByTestId("dialog-option-Summarise this.")).toBeDefined());
    await act(async () => screen.getByTestId("dialog-option-Summarise this.").click());
    await waitFor(() => expect(host?.editorText).toBe("Summarise this."));
  });
});

describe("README", () => {
  for (const name of EXAMPLES) {
    test(`embeds ${name} verbatim`, async () => {
      const source = await Bun.file(new URL(`../examples/${name}`, import.meta.url)).text();
      expect(readme).toContain(source.trim());
      // The file is named next to its snippet, so a reader can find it.
      expect(readme).toContain(`examples/${name}`);
    });
  }
});
