import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

// `system` turns are hoisted into the request's system prompt, so ordinary chat
// history — including earlier assistant replies — can be replayed as-is.
const answer = streamChat(endpoint, model, [
  { role: "system", content: "Answer in one sentence." },
  { role: "user", content: "What is TypeScript?" },
  { role: "assistant", content: "A typed superset of JavaScript." },
  { role: "user", content: "And who maintains it?" },
]);

let reply = "";
for await (const delta of answer) if (delta.kind === "text") reply += delta.text;

console.log(reply);
