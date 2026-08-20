import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { type ComponentProps, useState } from "react";
import { Loader } from "../src/Loader.tsx";
import { PromptBar } from "../src/PromptBar.tsx";
import { ReasoningTrace } from "../src/ReasoningTrace.tsx";
import { Sidebar } from "../src/Sidebar.tsx";
import { StreamText } from "../src/StreamText.tsx";

// bun:test hooks aren't globals, so testing-library can't auto-register this.
afterEach(cleanup);

describe("Loader", () => {
  test("renders the label and an elapsed timer", () => {
    render(<Loader label="Waiting for model" />);
    expect(screen.getByRole("status").textContent).toContain("Waiting for model");
    expect(screen.getByRole("status").textContent).toContain("0.0s");
  });
});

describe("StreamText", () => {
  test("renders every word and a caret while streaming", () => {
    const { container } = render(<StreamText text="hello brave world" done={false} />);
    expect(container.textContent).toContain("hello brave world");
    expect(container.querySelectorAll(".stream-word").length).toBe(3);
    expect(container.querySelectorAll(".stream-caret").length).toBe(1);
  });

  test("drops the caret when done", () => {
    const { container } = render(<StreamText text="hello world" done />);
    expect(container.querySelectorAll(".stream-word").length).toBe(2);
    expect(container.querySelector(".stream-caret")).toBeNull();
  });

  test("renders markdown blocks, not their source", () => {
    const { container } = render(
      <StreamText
        text={"# Title\n\n- one\n- two\n\n[docs](https://example.com)\n\n> quoted"}
        done
      />,
    );
    expect(container.querySelector("h1")?.textContent).toBe("Title");
    expect(container.querySelectorAll("li").length).toBe(2);
    expect(container.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(container.querySelector("blockquote")?.textContent).toContain("quoted");
    expect(container.textContent).not.toContain("# Title");
  });

  test("renders GFM tables and strikethrough", () => {
    const { container } = render(
      <StreamText text={"| a | b |\n| - | - |\n| 1 | 2 |\n\n~~gone~~"} done />,
    );
    expect(container.querySelectorAll("th").length).toBe(2);
    expect(container.querySelectorAll("td").length).toBe(2);
    expect(container.querySelector("del")?.textContent).toBe("gone");
  });

  test("quotes code verbatim instead of splitting it into words", () => {
    const { container } = render(<StreamText text={"```ts\nconst x = 1;\n```"} done />);
    expect(container.querySelector("pre code")?.textContent).toBe("const x = 1;\n");
    expect(container.querySelectorAll("pre .stream-word").length).toBe(0);
  });

  test("leaves raw HTML as text rather than rendering it", () => {
    const { container } = render(<StreamText text={"<img src=x onerror=alert(1)>"} done />);
    expect(container.querySelector("img")).toBeNull();
  });

  test("keeps earlier words mounted as the answer grows, so only the new one animates", () => {
    const { container, rerender } = render(<StreamText text="hello" done={false} />);
    const first = container.querySelector(".stream-word");
    rerender(<StreamText text="hello brave" done={false} />);
    expect(container.querySelector(".stream-word")).toBe(first);
    expect(container.querySelectorAll(".stream-word").length).toBe(2);
  });

  test("trails the caret inside the last block of a partial answer", () => {
    const { container } = render(<StreamText text={"- one\n- two"} done={false} />);
    const caret = container.querySelector(".stream-caret");
    expect(caret?.parentElement?.tagName).toBe("LI");
    expect(caret?.parentElement?.textContent).toContain("two");
  });
});

describe("ReasoningTrace", () => {
  test("shows the duration once settled and toggles the trace", () => {
    render(<ReasoningTrace working={false} seconds={4} text="reasoning trace" />);
    const toggle = screen.getByRole("button");
    expect(toggle.textContent).toContain("Thought for 4s");
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("reasoning trace")).toBeTruthy();
  });

  test("auto-expands and shimmers while working", () => {
    render(<ReasoningTrace working seconds={0} text="…" />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Thinking")).toBeTruthy();
  });
});

describe("PromptBar", () => {
  const noop = () => {};

  /** PromptBar is controlled, so a test has to hold the draft for it. */
  function Composer(props: Omit<ComponentProps<typeof PromptBar>, "text" | "onTextChange">) {
    const [draft, setDraft] = useState("");
    return <PromptBar {...props} text={draft} onTextChange={setDraft} />;
  }

  test("sends trimmed text on Enter and clears the draft", () => {
    const sent: string[] = [];
    render(
      <Composer
        onSend={(text) => sent.push(text)}
        busy={false}
        onStop={noop}
        models={[{ value: "m1", label: "m1" }]}
        model="m1"
        onModelChange={noop}
      />,
    );
    const input = screen.getByLabelText("Prompt");
    fireEvent.change(input, { target: { value: "  hi there  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(sent).toEqual(["hi there"]);
    expect((input as HTMLTextAreaElement).value).toBe("");
  });

  test("Shift+Enter does not send", () => {
    const sent: string[] = [];
    render(
      <Composer
        onSend={(text) => sent.push(text)}
        busy={false}
        onStop={noop}
        models={[]}
        model="m1"
        onModelChange={noop}
      />,
    );
    const input = screen.getByLabelText("Prompt");
    fireEvent.change(input, { target: { value: "line" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(sent).toEqual([]);
  });

  test("opens the model menu and reports a selection", () => {
    const chosen: string[] = [];
    render(
      <Composer
        onSend={noop}
        busy={false}
        onStop={noop}
        models={[
          { value: "alpha", label: "alpha" },
          { value: "beta", label: "beta" },
        ]}
        model="alpha"
        onModelChange={(m) => chosen.push(m)}
      />,
    );
    fireEvent.click(screen.getByLabelText("Choose model"));
    fireEvent.click(screen.getByText("beta"));
    expect(chosen).toEqual(["beta"]);
  });

  test("shows stop instead of send while busy", () => {
    const stops: number[] = [];
    render(
      <Composer
        onSend={noop}
        busy
        onStop={() => stops.push(1)}
        models={[]}
        model="m"
        onModelChange={noop}
      />,
    );
    fireEvent.click(screen.getByLabelText("Stop"));
    expect(stops).toEqual([1]);
    expect(screen.queryByLabelText("Send")).toBeNull();
  });
});

describe("Sidebar", () => {
  const chats = [
    { id: "a", title: "First chat" },
    { id: "b", title: "Second chat" },
  ];

  test("lists chats and reports selection, creation, deletion, settings", () => {
    const events: string[] = [];
    render(
      <Sidebar
        title="Tiny"
        chats={chats}
        activeId="a"
        onSelect={(id) => events.push(`select:${id}`)}
        onNew={() => events.push("new")}
        onDelete={(id) => events.push(`delete:${id}`)}
        onSettings={() => events.push("settings")}
      />,
    );
    fireEvent.click(screen.getByText("Second chat"));
    fireEvent.click(screen.getByText("New chat"));
    fireEvent.click(screen.getByLabelText("Delete First chat"));
    fireEvent.click(screen.getByText("Settings"));
    expect(events).toEqual(["select:b", "new", "delete:a", "settings"]);
  });

  test("collapsing hides the chat list", () => {
    render(
      <Sidebar
        title="Tiny"
        chats={chats}
        activeId={undefined}
        onSelect={() => {}}
        onNew={() => {}}
        onDelete={() => {}}
        onSettings={() => {}}
      />,
    );
    fireEvent.click(screen.getByLabelText("Collapse sidebar"));
    expect(screen.queryByText("First chat")).toBeNull();
    fireEvent.click(screen.getByLabelText("Expand sidebar"));
    expect(screen.getByText("First chat")).toBeTruthy();
  });
});
