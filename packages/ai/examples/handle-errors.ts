import { ChatApiError, describeError, listModels } from "@tiny/ai";

const baseUrl = process.env.AI_BASE_URL ?? "https://api.openai.com/v1";

// A deliberately wrong key, so the endpoint answers 401 and there is something
// to render.
const endpoint = { baseUrl, apiKey: "not-a-real-key" };

try {
  await listModels(endpoint);
  console.log("the key worked after all");
} catch (error) {
  // `status` is set here because this package read the response itself; for a
  // failed stream pi has already folded the status into the message.
  if (error instanceof ChatApiError) console.log("status:", error.status);
  console.log(describeError(error)); // "401: Incorrect API key provided ..."
}
