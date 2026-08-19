import type { ExtensionAPI } from "@tiny/ai";
import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

// An extension is a factory that receives the extension API and subscribes to
// events — the same shape pi's own extensions use, so this would be the default
// export of a file under `.pi/extensions/`.
const beTerse = (pi: ExtensionAPI) => {
  pi.on("before_agent_start", () => ({ systemPrompt: "Answer in one sentence." }));
};

for await (const delta of streamChat(
  endpoint,
  model,
  [{ role: "user", content: "Why is the sky blue?" }],
  { extensions: [beTerse] },
)) {
  if (delta.kind === "text") process.stdout.write(delta.text);
}

process.stdout.write("\n");
