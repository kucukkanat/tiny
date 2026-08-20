import { streamChat } from "@tiny/ai";
import { loadPlugins } from "@tiny/plugin";
import { historyWindow, systemPrompt } from "@tiny/plugin-prompt";

// Unlike @tiny/plugin-trace, both of these CHANGE what the model is sent:
// one adds a system prompt, the other replays only the last N turns. Add them
// deliberately — every reply in the app changes.
const { extensions } = await loadPlugins([
  systemPrompt("You are Tiny, a concise and friendly assistant."),
  historyWindow(40),
]);

const endpoint = { baseUrl: process.env.BASE_URL ?? "http://localhost:8787/v1", apiKey: "sk-test" };
for await (const delta of streamChat(
  endpoint,
  "mock-tool-caller",
  [{ role: "user", content: "hello" }],
  { extensions },
)) {
  if (delta.kind === "text") process.stdout.write(delta.text);
}
