import { streamChat } from "@tiny/ai";
import { loadPlugins } from "@tiny/plugin";
import { streamTrace, usageLogger } from "@tiny/plugin-trace";

// Both plugins only listen, so the request below is byte-for-byte the request
// you would have sent without them. That is the whole contract of this package.
const seen: string[] = [];
const { extensions } = await loadPlugins([usageLogger((line) => seen.push(line)), streamTrace()]);

const endpoint = { baseUrl: process.env.BASE_URL ?? "http://localhost:8787/v1", apiKey: "sk-test" };
for await (const _delta of streamChat(
  endpoint,
  "mock-tool-caller",
  [{ role: "user", content: "hello" }],
  { extensions },
));

console.log(seen.join("\n")); // [usage] 10 in + 5 out = 15 tokens
