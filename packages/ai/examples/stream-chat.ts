import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

for await (const delta of streamChat(endpoint, model, [
  { role: "user", content: "Why is the sky blue?" },
])) {
  if (delta.kind === "reasoning") process.stdout.write(`[thinking] ${delta.text}`);
  else if (delta.kind === "text") process.stdout.write(delta.text);
}

process.stdout.write("\n");
