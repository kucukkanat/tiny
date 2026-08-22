import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { definePlugin, PluginHost, Slot, usePluginContext, usePluginHost } from "@tiny/plugin";
import { PromptBar } from "@tiny/ui";

// The composer's text has one owner: the host. A plugin reading
// `ctx.ui.getEditorText()` must see what the *user* typed, not only what some
// plugin pushed in — that is the difference between the documented `shout`
// example working and silently sending an empty string.

afterEach(cleanup);

/** Renders whatever a plugin currently sees as the draft. */
const watcher = definePlugin("watcher", (tiny) =>
  tiny.contribute("composer.actions", function Watching() {
    const ctx = usePluginContext();
    return <span data-testid="seen-by-plugin">{ctx.ui.getEditorText()}</span>;
  }),
);

/** `ChatShell`, reduced to the one wire this is about. */
function Composer() {
  const { editorText, setEditorText } = usePluginHost();
  return (
    <PromptBar
      onSend={() => {}}
      busy={false}
      onStop={() => {}}
      models={[{ value: "m", label: "m" }]}
      model="m"
      onModelChange={() => {}}
      text={editorText}
      onTextChange={setEditorText}
      actions={<Slot name="composer.actions" />}
    />
  );
}

const mount = async () => {
  await act(async () => {
    render(
      <PluginHost plugins={[watcher]}>
        <Composer />
      </PluginHost>,
    );
  });
  return screen.getByLabelText("Prompt") as HTMLTextAreaElement;
};

describe("the composer's text", () => {
  test("is visible to a plugin after the user types it", async () => {
    const input = await mount();

    fireEvent.change(input, { target: { value: "shout this" } });
    await act(async () => {});

    expect(input.value).toBe("shout this");
    expect(screen.getByTestId("seen-by-plugin").textContent).toBe("shout this");
  });

  test("stays empty while the user has typed nothing", async () => {
    await mount();

    expect(screen.getByTestId("seen-by-plugin").textContent).toBe("");
  });
});
