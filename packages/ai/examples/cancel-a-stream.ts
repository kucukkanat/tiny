import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

const controller = new AbortController();

try {
  for await (const delta of streamChat(
    endpoint,
    model,
    [{ role: "user", content: "Count slowly to a hundred." }],
    { signal: controller.signal },
  )) {
    if (delta.kind !== "tool") process.stdout.write(delta.text);
    // A UI would abort on a click; this stops after the first delta lands.
    controller.abort();
  }
} catch (error) {
  // An aborted stream rejects, so the stop has to be told apart from a failure.
  if (!controller.signal.aborted) throw error;
  console.log("\nstopped by the user");
}
