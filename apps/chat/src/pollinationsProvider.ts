import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * Pollinations' text endpoint, OpenAI-shaped and answering anonymous
 * requests — no signup, no key, `Authorization` header omitted entirely.
 * Added for testing the keyless-provider path in this app, not as a
 * recommendation for production use.
 */
export const pollinations = (): IdentifiedPlugin =>
  definePlugin("pollinations", (tiny) => {
    tiny.registerProvider("pollinations", {
      name: "Pollinations (free, no key)",
      baseUrl: "https://gen.pollinations.ai/v1",
      // The server ignores this — Pollinations never checks it — but pi-ai's
      // client refuses to send a request without *some* key, so it needs a
      // placeholder.
      apiKey: "unused",
      // "openai" is Pollinations' own alias for its anonymous-tier model.
      models: ["openai"],
    });
  });
