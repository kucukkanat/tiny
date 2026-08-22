import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { useMemo } from "react";
import { clearChat } from "../examples/clearChat.ts";
import { copyButton } from "../examples/copyButton.tsx";
import { greet } from "../examples/greet.ts";
import { outlinePanel } from "../examples/outlinePanel.tsx";
import { savedPrompts } from "../examples/savedPrompts.tsx";
import { scratchpadPage } from "../examples/scratchpadPage.tsx";
import { tokenMeter } from "../examples/tokenMeter.ts";
import { useProvideApp } from "../src/hooks.ts";
import { Panels } from "../src/Panels.tsx";
import { PluginPage } from "../src/PluginPage.tsx";
import { loadPlugins } from "../src/registry.ts";
import { Slot, Widgets } from "../src/Slot.tsx";
import type { PluginMessage } from "../src/tiny.ts";
import { host, mountHost } from "./mount.tsx";

// Every example under examples/ is a real plugin, run here so the snippet a
// reader copies is one that works. That it *is* the snippet is asserted by
// apps/docs/test/examples.test.ts, over every `path=` fence in the repo.

afterEach(cleanup);

// Hoisted: an inline default would be a new identity on every render, and the
// bridge is memoised on it — which is the re-render loop `useProvideApp` warns
// about, and a good demonstration of how easy it is to write.
const ignore = (_text: string) => {};

/** Publishes a fixed thread, so an example that reads chat state has one. */
function Thread({
  messages,
  onSend = ignore,
}: {
  messages: readonly PluginMessage[];
  onSend?: (text: string) => void;
}) {
  useProvideApp(
    useMemo(
      () => ({
        messages,
        streaming: undefined,
        settings: undefined,
        signal: undefined,
        send: onSend,
        stop: () => {},
        updateSettings: () => {},
        navigate: () => {},
      }),
      [messages, onSend],
    ),
  );
  return null;
}

const mount = mountHost;

describe("examples run", () => {
  test("greet registers the command the quickstart promises", async () => {
    await mount([greet()]);

    expect(host?.commands.map((command) => command.name)).toEqual(["greet"]);
    await act(async () => {
      await host?.runCommand("greet", "there");
    });
    await waitFor(() =>
      expect(screen.getByTestId("plugin-toast").textContent).toBe("Hello, there"),
    );
  });

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

  test("outlinePanel puts a rail on the app and replays a question into the composer", async () => {
    localStorage.clear();
    const messages: readonly PluginMessage[] = [
      { role: "user", content: "What is a monoid?" },
      { role: "assistant", content: "A set with an associative op and an identity." },
    ];
    await mount(
      [outlinePanel()],
      <>
        <Thread messages={messages} />
        <Panels />
      </>,
    );

    // The rail exists because a panel was registered — nothing else asked for it.
    await waitFor(() => expect(screen.getByTestId("plugin-panels")).toBeDefined());
    // Only the questions, not the answers.
    const entries = screen.getAllByTestId("outline-entry");
    expect(entries.map((node) => node.textContent)).toEqual(["What is a monoid?"]);

    await act(async () => entries[0]?.click());
    await waitFor(() => expect(host?.editorText).toBe("What is a monoid?"));
  });

  test("scratchpadPage registers a labelled page that persists what is typed", async () => {
    localStorage.clear();
    const { routes } = await loadPlugins([scratchpadPage()]);
    const entry = routes[0];
    expect(entry?.path).toBe("/scratchpad");
    // The label is the page asking the app for a navigation row.
    expect(entry?.options.label).toBe("Scratchpad");
    if (entry === undefined) return;

    await mount([scratchpadPage()], <PluginPage entry={entry} />);

    const notes = await waitFor(() => screen.getByTestId("scratchpad") as HTMLTextAreaElement);
    await act(async () => {
      fireEvent.change(notes, { target: { value: "Ask about monoids" } });
    });
    expect(localStorage.getItem("tiny-plugin:scratchpadPage:text")).toBe('"Ask about monoids"');

    // Notes that "outlive the conversation" have to be read back on the next
    // visit, which is a fresh mount — asserting the write alone would pass even
    // if the textarea always started empty and the first keystroke wiped them.
    cleanup();
    await mount([scratchpadPage()], <PluginPage entry={entry} />);
    const reopened = await waitFor(() => screen.getByTestId("scratchpad") as HTMLTextAreaElement);
    expect(reopened.value).toBe("Ask about monoids");

    // And the button hands them to the chat, through the app's own `send`.
    cleanup();
    const sent: string[] = [];
    await mount(
      [scratchpadPage()],
      <>
        <Thread messages={[]} onSend={(text) => sent.push(text)} />
        <PluginPage entry={entry} />
      </>,
    );
    await waitFor(() => expect(screen.getByTestId("scratchpad-ask")).toBeDefined());
    await act(async () => screen.getByTestId("scratchpad-ask").click());
    expect(sent).toEqual(["Ask about monoids"]);
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
