import type { ExtensionAPI } from "@tiny/ai";
import { streamChat } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};
const model = process.env.AI_MODEL ?? "gpt-4.1-mini";

/** One extension can subscribe to as many events as it needs. */
const observant = (tiny: ExtensionAPI) => {
  // Replace the system prompt for this request. pi chains this event, so
  // `event.systemPrompt` already carries what earlier extensions returned.
  tiny.on("before_agent_start", (event) => ({
    systemPrompt: `${event.systemPrompt} Answer in one sentence.`.trim(),
  }));

  // Modify the replayed history. `event.messages` is a copy, safe to modify.
  tiny.on("context", (event) => ({ messages: event.messages.slice(-20) }));

  // Watch the reply assemble, token by token.
  tiny.on("message_update", (event) => {
    if (event.assistantMessageEvent.type === "thinking_delta") process.stdout.write("·");
  });

  // The finalized message carries usage and cost.
  tiny.on("message_end", (event) => {
    const { input, output, totalTokens } = event.message.usage;
    console.log(`\n[usage] ${input} in + ${output} out = ${totalTokens} tokens`);
  });
};

/** Handlers may be async; pi awaits them before continuing. */
const slowAudit = (tiny: ExtensionAPI) => {
  tiny.on("context", async (event) => {
    await Promise.resolve();
    console.log(`[audit] sending ${event.messages.length} message(s)`);
  });
};

for await (const delta of streamChat(
  endpoint,
  model,
  [{ role: "user", content: "Why is the sky blue?" }],
  { extensions: [observant, slowAudit] },
)) {
  if (delta.kind === "text") process.stdout.write(delta.text);
}
