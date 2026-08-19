import { listModels } from "@tiny/ai";

const endpoint = {
  baseUrl: process.env.AI_BASE_URL ?? "https://api.openai.com/v1",
  apiKey: process.env.AI_API_KEY ?? "",
};

const ids = await listModels(endpoint); // sorted alphabetically

console.log(`${ids.length} models available:`);
for (const id of ids) console.log(`  ${id}`);
