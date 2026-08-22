import { describe, expect, test } from "bun:test";
import { toolOutput } from "@tiny/ai";
import { reported } from "../../../test/helpers.ts";
import { onPluginProblem, type PluginProblem, reportPluginProblem } from "../src/problems.ts";
import { loadPlugins } from "../src/registry.ts";
import { definePlugin } from "../src/tiny.ts";

/** Runs `body` with the console quiet and problems collected. */
const collected = async (body: () => Promise<void> | void) => {
  const problems: PluginProblem[] = [];
  const off = onPluginProblem((problem) => void problems.push(problem));
  const lines = await reported(body);
  off();
  return { problems, lines };
};

const echo = () => ({
  name: "echo",
  description: "Echo",
  parameters: { type: "object" },
  execute: () => toolOutput("ok"),
});

describe("onPluginProblem", () => {
  test("hears a withheld registration, naming the plugin at fault", async () => {
    const { problems, lines } = await collected(async () => {
      await loadPlugins([
        definePlugin("meter", { needs: ["chat"] }, (tiny) => void tiny.registerTool(echo())),
      ]);
    });

    expect(problems).toHaveLength(1);
    expect(problems[0]?.pluginId).toBe("meter");
    expect(problems[0]?.message).toContain('needs the "tools" capability');
    // The console line keeps the format it always had, label and all.
    expect(lines[0]).toStartWith("[plugin:meter] ");
  });

  test("hears a route clash", async () => {
    const { problems } = await collected(async () => {
      await loadPlugins([
        definePlugin(
          "first",
          (tiny) => void tiny.registerRoute("/notes", { component: () => null }),
        ),
        definePlugin(
          "second",
          (tiny) => void tiny.registerRoute("/notes", { component: () => null }),
        ),
      ]);
    });

    expect(problems.map((problem) => problem.pluginId)).toEqual(["second"]);
    expect(problems[0]?.message).toContain("already registered");
  });

  test("unsubscribing stops delivery", async () => {
    const heard: PluginProblem[] = [];
    const off = onPluginProblem((problem) => void heard.push(problem));
    await reported(() => {
      reportPluginProblem({ pluginId: "a", message: "one" });
      off();
      reportPluginProblem({ pluginId: "a", message: "two" });
    });
    expect(heard.map((problem) => problem.message)).toEqual(["one"]);
  });

  test("a throwing listener does not stop the report reaching the others", async () => {
    const heard: string[] = [];
    const offBroken = onPluginProblem(() => {
      throw new Error("boom");
    });
    const offListening = onPluginProblem((problem) => void heard.push(problem.message));
    await reported(() => reportPluginProblem({ pluginId: undefined, message: "still delivered" }));
    offBroken();
    offListening();
    expect(heard).toEqual(["still delivered"]);
  });
});
