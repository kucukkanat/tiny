import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { definePlugin } from "@tiny/plugin";
import { TinyApp } from "../src/TinyApp.tsx";

// The one-line mounting the docs promise: no `PluginHost` to wire, no router to
// pick, no bridge to memoise — a plugin list in, a working app out.

afterEach(cleanup);

describe("TinyApp", () => {
  test("mounts the whole app around a plugin list", async () => {
    const badge = definePlugin("badge", (tiny) =>
      tiny.contribute("sidebar.footer", () => <span data-testid="badge">v1</span>),
    );

    await act(async () => {
      render(<TinyApp plugins={[badge]} title="Test bench" />);
    });

    // The shell's chrome is up, under the given title…
    expect(screen.getByText("Test bench")).toBeDefined();
    expect(screen.getByLabelText("Prompt")).toBeDefined();
    // …and the plugin reached its slot through the host TinyApp mounted.
    await waitFor(() => expect(screen.getByTestId("badge")).toBeDefined());
  });

  test("needs no props beyond the plugin list", async () => {
    await act(async () => {
      render(<TinyApp plugins={[]} />);
    });
    expect(screen.getByText("Tiny")).toBeDefined();
  });
});
