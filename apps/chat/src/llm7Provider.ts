import type { IdentifiedPlugin } from "@tiny/plugin";
import { definePlugin } from "@tiny/plugin";

/**
 * LLM7, an OpenAI-compatible gateway that answers anonymously — no signup, no
 * key, and it accepts the literal string "unused" where a key would go, which
 * is what makes it usable here: pi-ai's client refuses to send a request with
 * an empty key, and endpoints that want *no* header at all reject the
 * placeholder with a 403.
 *
 * Wired in so the app is usable the moment it loads: pick one of these in the
 * model picker and start chatting, no endpoint to configure first.
 */
export const llm7 = (): IdentifiedPlugin =>
  definePlugin("llm7", (tiny) => {
    tiny.registerProvider("llm7", {
      name: "LLM7 (free, no key)",
      baseUrl: "https://api.llm7.io/v1",
      // Not a secret — LLM7's documented sentinel for anonymous access.
      apiKey: "unused",
      // Pinned rather than read from `/models`: that route lists 44 models, most
      // of which fail an anonymous caller. Only LLM7's "turbo" tier answers
      // without a token, and of that tier these are the three that survive what
      // this app actually sends — the rest are excluded on purpose:
      //   - `mistral-Nemo-Instruct-2407` 400s with "does not support tools",
      //     and `fileSystem()` puts tools on every request;
      //   - `meta-Llama-3.1-8B-Instruct-Turbo` answers a plain greeting with a
      //     fabricated fs_read call, so the approval gate fires on hello;
      //   - `DeepSeek-V4-Flash-0731` and `minimax-m2.7` are reasoning models
      //     that return "rate limit exceeded" / "temporarily busy" unauthenticated;
      //   - `gemma4:31b` 401s without a real key.
      models: [
        { id: "gemini-3.1-flash-lite", contextWindow: 256_000 },
        { id: "gpt-oss:20b", contextWindow: 128_000 },
        { id: "codestral-latest", contextWindow: 32_000 },
      ],
    });
  });
