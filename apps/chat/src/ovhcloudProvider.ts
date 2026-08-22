import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * OVHcloud's AI Endpoints, reached with no `Authorization` header at all —
 * OVHcloud documents this as its anonymous tier, capped at 2 requests per
 * minute per model per IP. Added for testing the keyless-provider path in
 * this app, not as a recommendation for production use.
 */
export const ovhcloud = (): IdentifiedPlugin =>
  definePlugin("ovhcloud", (tiny) => {
    tiny.registerProvider("ovhcloud", {
      name: "OVHcloud AI Endpoints (free, no key)",
      baseUrl: "https://oai.endpoints.kepler.ai.cloud.ovh.net/v1",
      // The server ignores this — anonymous requests need no header at all —
      // but pi-ai's client refuses to send a request without *some* key, so
      // it needs a placeholder.
      apiKey: "unused",
      models: [{ id: "gpt-oss-120b", reasoning: true }],
    });
  });
