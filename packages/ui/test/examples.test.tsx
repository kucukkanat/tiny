import { afterEach, describe, expect, test } from "bun:test";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ApprovalCardExample } from "../examples/ApprovalCardExample.tsx";
import { GlideMenuExample } from "../examples/GlideMenuExample.tsx";
import { LoaderExample } from "../examples/LoaderExample.tsx";
import { PromptBarExample } from "../examples/PromptBarExample.tsx";
import { ReasoningTraceExample } from "../examples/ReasoningTraceExample.tsx";
import { SidebarExample } from "../examples/SidebarExample.tsx";
import { StreamTextExample } from "../examples/StreamTextExample.tsx";

// Every README snippet is a real component under examples/. Rendering each one
// proves the snippet compiles and runs, and the README is then asserted to
// embed the file verbatim so a snippet cannot rot into something that does not.

// Every example here is run, so the snippet a reader copies is one that works.
// That it *is* the snippet is asserted centrally by apps/docs/test/examples.test.ts,
// over every `path=` fence in the repo — READMEs included.
// bun:test hooks aren't globals, so testing-library can't auto-register this.
afterEach(cleanup);

describe("examples render", () => {
  test("ApprovalCardExample sends only once a choice is made", async () => {
    render(<ApprovalCardExample />);
    // The arrow is inert until there is an answer to send.
    expect(screen.getByTestId("approval-send").hasAttribute("disabled")).toBe(true);

    fireEvent.change(screen.getByTestId("approval-note"), { target: { value: "use /tmp" } });
    fireEvent.click(screen.getByTestId("approval-option-deny"));
    fireEvent.click(screen.getByTestId("approval-remember"));
    fireEvent.click(screen.getByTestId("approval-send"));

    await waitFor(() => expect(screen.getByText(/deny/)).toBeTruthy());
    expect(screen.getByText(/use \/tmp/)).toBeTruthy();
    expect(screen.getByText(/remembered/)).toBeTruthy();
  });

  test("StreamTextExample reveals a markdown reply word by word", async () => {
    const { container } = render(<StreamTextExample />);
    await waitFor(() => expect(container.querySelector("h3")?.textContent).toContain("Why"));
  });

  test("ReasoningTraceExample shimmers before it settles", () => {
    render(<ReasoningTraceExample />);
    expect(screen.getByText("Thinking")).toBeTruthy();
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("true");
  });

  test("LoaderExample shows the labelled loader with its timer", () => {
    render(<LoaderExample />);
    expect(screen.getByRole("status").textContent).toContain("Waiting for model");
  });

  test("PromptBarExample sends a message and flips to stop", () => {
    render(<PromptBarExample />);
    const input = screen.getByLabelText("Prompt");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("hello")).toBeTruthy();
    // `busy` is now true, so the send button became stop.
    expect(screen.getByLabelText("Stop")).toBeTruthy();
  });

  test("SidebarExample lists chats and adds a new one", () => {
    render(<SidebarExample />);
    expect(screen.getByText("Why is the sky blue?")).toBeTruthy();
    fireEvent.click(screen.getByTitle("New chat"));
    expect(screen.getByText("Untitled chat")).toBeTruthy();
  });

  test("GlideMenuExample renders every row as an opt-in target", () => {
    const { container } = render(<GlideMenuExample />);
    expect(container.querySelectorAll("[data-row]").length).toBe(3);
  });
});
