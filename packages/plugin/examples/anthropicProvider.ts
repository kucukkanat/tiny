import type { Plugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * A provider that is not OpenAI-shaped.
 *
 * `api` is pi's api type identifier, and it decides which streaming
 * implementation the request goes through. It may be set for the whole endpoint
 * and overridden per model, exactly as pi allows.
 *
 * pi-ai already configures the Anthropic SDK for browser use — it sends
 * `anthropic-dangerous-direct-browser-access`, without which Anthropic refuses a
 * cross-origin request outright — so this works from a page with no proxy.
 */
export const anthropic = (apiKey: () => string): Plugin =>
  definePlugin("anthropic", (tiny) => {
    tiny.registerProvider("anthropic", {
      name: "Anthropic",
      // No `/v1`: the Anthropic implementation appends its own.
      baseUrl: "https://api.anthropic.com",
      api: "anthropic-messages",
      apiKey,
      // A bare model id is enough. An object says what the endpoint's own model
      // route cannot: that this one reasons, and how much context it has — which
      // is what makes `ctx.getContextUsage()` report a real window rather than 0.
      models: [
        "claude-haiku-4-5",
        { id: "claude-opus-4-6", reasoning: true, contextWindow: 200_000 },
      ],
    });
  });
