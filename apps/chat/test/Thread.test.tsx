import { afterEach, describe, expect, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";
import type { Plugin } from "@tiny/plugin";
import { PluginHost } from "@tiny/plugin";
import { Thread } from "../src/components/Thread.tsx";
import type { Streaming } from "../src/hooks/useChat.ts";

// `message.pending` is where a run parks a question it is waiting on — an
// approval, usually. It has to appear whenever a reply is in flight, including
// before the reply has produced anything at all.

afterEach(cleanup);

const asking: Plugin = (pi) =>
  pi.contribute("message.pending", function Question() {
    return <span data-testid="pending-question">May I?</span>;
  });

const show = async (streaming: Streaming | undefined) => {
  await act(async () => {
    render(
      <PluginHost plugins={[asking]}>
        <Thread messages={[]} streaming={streaming} error={undefined} />
      </PluginHost>,
    );
  });
};

const NOTHING_YET: Streaming = { reasoning: "", text: "", reasoningSeconds: 0, tools: [] };

describe("Thread", () => {
  test("renders a pending question before the reply has produced anything", async () => {
    // The regression this guards: the slot used to live inside the branch that
    // only renders once a delta has arrived, so a gate that fired on the very
    // first tool call had nowhere to draw and the run hung.
    await show(NOTHING_YET);

    expect(screen.getByTestId("pending-question")).toBeDefined();
    expect(screen.getByRole("status")).toBeDefined(); // still shows the loader
  });

  test("renders it once the reply is under way too", async () => {
    await show({ ...NOTHING_YET, text: "thinking about it" });

    expect(screen.getByTestId("pending-question")).toBeDefined();
  });

  test("does not render it when no reply is in flight", async () => {
    await show(undefined);

    expect(screen.queryByTestId("pending-question")).toBeNull();
  });
});
