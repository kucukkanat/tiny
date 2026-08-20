# @tiny/plugin-prompt

Two plugins that **change what the model is sent**.

| Plugin | Does |
| --- | --- |
| `systemPrompt(text)` | gives every request an app-level system prompt, unless the conversation already carries one |
| `historyWindow(turns)` | replays only the last `turns` messages, so a long thread cannot grow the request without bound |

Both rewrite the request, so adding either changes every reply — which is why
they are not in the chat app's plugin list by default, and why they are not in
[`@tiny/plugin-trace`](../plugin-trace), whose plugins only observe.

`historyWindow` trims the *request* only: the system prompt sits beside the turns
in pi's context and always survives, and the conversation on disk is untouched.

## Usage

`examples/shape-the-request.ts`:

```ts path=packages/plugin-prompt/examples/shape-the-request.ts
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
```

## Test

```sh
bun test
```
