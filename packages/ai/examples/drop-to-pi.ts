import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";
import { endpointModel } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};

// `endpointModel` builds the pi descriptor, so pi's own API module can be
// called directly when a hook is not enough and you want the raw stream.
const model = endpointModel(endpoint, process.env.AI_MODEL ?? "gpt-4.1-mini");

const stream = openAICompletionsApi().stream(
  model,
  { messages: [{ role: "user", content: "Hello!", timestamp: Date.now() }] },
  { apiKey: endpoint.apiKey },
);

for await (const event of stream) {
  if (event.type === "text_delta") process.stdout.write(event.delta);
}

// The assembled message carries everything this facade does not surface.
const message = await stream.result();
console.log(`\n${message.usage.totalTokens} tokens, $${message.usage.cost.total}`);
