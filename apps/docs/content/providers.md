# Providers

`registerProvider` adds another endpoint to the model picker — OpenAI-compatible
or not. The user keeps their own endpoint in settings; a plugin can add as many
more as it likes, in any of pi's browser-viable [api types](#api-types), and each
conversation remembers which one it belongs to.

```ts path=packages/plugin/examples/groqProvider.ts
import type { Plugin } from "@tiny/plugin";

/**
 * An endpoint added to the model picker — pi's `registerProvider`, reduced to
 * the part that survives a browser.
 *
 * pi's version also carries credential storage, catalog persistence and a
 * native `pi-ai` provider; none has anywhere to live here. What remains is what
 * actually travels: where to send the request, how to authenticate, and which
 * models exist.
 */
export const groq = (): Plugin => (pi) => {
  pi.registerProvider("groq", {
    name: "Groq",
    baseUrl: "https://api.groq.com/openai/v1",
    // Omitting `models` asks the endpoint's own /models route, which is what an
    // OpenAI-compatible server publishes.
    models: ["llama-3.3-70b-versatile", "mixtral-8x7b-32768"],
    // A thunk rather than a string, so the key is fetched when a request needs
    // it instead of sitting in the registry where `ctx.settings` would expose
    // it to every other plugin.
    apiKey: () => localStorage.getItem("groq:key") ?? "",
  });

  pi.registerCommand("groq:key", {
    description: "Set the Groq API key",
    handler: async (args, ctx) => {
      const key = args !== "" ? args : await ctx.ui.input("Groq API key", "gsk_…");
      if (key === undefined || key === "") return;
      localStorage.setItem("groq:key", key);
      ctx.ui.notify("Groq key saved", "info");
    },
  });

  pi.registerCommand("groq:off", {
    description: "Remove the Groq provider",
    // Registering and unregistering both work after the factory has returned,
    // as they do in pi — the picker updates without a reload.
    handler: (_args, ctx) => {
      ctx.ui.notify(pi.unregisterProvider("groq") ? "Groq removed" : "Groq was not registered");
    },
  });
};
```

## The config

```ts
type ProviderConfig = {
  readonly name: string;
  readonly baseUrl: string;
  readonly apiKey?: string | (() => string | Promise<string>);
  readonly api?: ApiType;
  readonly models?:
    | readonly ProviderModel[]
    | ((signal: AbortSignal | undefined) => Promise<readonly ProviderModel[]>);
};

type ProviderModel = string | { id: string; api?: ApiType; reasoning?: boolean; contextWindow?: number; maxTokens?: number };
```

| Field | Notes |
| --- | --- |
| `name` | the group heading in the picker |
| `baseUrl` | whatever the chosen `api` expects; `http://localhost:11434/v1` works |
| `apiKey` | a string, or a thunk resolved when a request needs it. Omit it for a local server that wants none |
| `api` | which streaming implementation to use. Defaults to `openai-completions` |
| `models` | a fixed list, or a lookup. **Omit it** and the endpoint's own models route is asked |

Prefer the thunk form for `apiKey`. A key passed as a string sits in the registry,
where `ctx.settings` would put it in reach of every other plugin; a thunk is called
only when a request is about to go out.

## API types

`api` is pi's api type identifier, and it decides which streaming implementation
the request goes through. Set it on the provider, and override it per model —
exactly the two levels pi allows.

```ts path=packages/plugin/examples/anthropicProvider.ts
import type { Plugin } from "@tiny/plugin";

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
export const anthropic =
  (apiKey: () => string): Plugin =>
  (pi) => {
    pi.registerProvider("anthropic", {
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
  };
```

Six of pi's nine implementations reach a browser:

| `api` | For |
| --- | --- |
| `openai-completions` | OpenAI Chat Completions and the many servers that copy it — **the default** |
| `openai-responses` | OpenAI's Responses API |
| `azure-openai-responses` | Azure OpenAI Responses |
| `anthropic-messages` | Anthropic Claude and compatibles |
| `mistral-conversations` | Mistral's native streaming |
| `google-generative-ai` | Google Generative AI |

### The base URL is not the same shape for all of them

Each implementation is handed `baseUrl` verbatim and appends its own path, and
they do not agree on where the version segment lives. Getting this wrong produces
a 404 on the first request, or `/v1/v1/messages`.

| `api` | Base URL |
| --- | --- |
| `openai-completions`, `openai-responses` | `https://api.openai.com/v1` — **with** the version |
| `azure-openai-responses` | `https://<resource>.openai.azure.com/openai/v1` |
| `google-generative-ai` | `https://generativelanguage.googleapis.com/v1beta` — **with** it |
| `anthropic-messages` | `https://api.anthropic.com` — **without**; the SDK appends `/v1/messages` |
| `mistral-conversations` | `https://api.mistral.ai` — **without**; it resolves `v1/chat/completions` |

The model-listing routes follow the same rule, so a provider that gets its base
URL right lists models correctly too.

### Not available

The other three are **left out rather than failing at runtime**, because they
cannot work in a page at all:

| pi has | Why it cannot run here |
| --- | --- |
| `openai-codex-responses` | imports `node:zlib` |
| `google-vertex` | signs a service-account JWT through `GoogleAuth` |
| `bedrock-converse-stream` | transports over `@smithy/node-http-handler` |

Two things make the six work that are worth knowing about:

- **pi-ai already configures the vendor SDKs for browser use.** It passes
  `dangerouslyAllowBrowser`, and for Anthropic it sends
  `anthropic-dangerous-direct-browser-access` — the header without which
  Anthropic refuses a cross-origin request outright. None of that is something
  this app had to add.
- **Each implementation is behind its own dynamic import.** A reader who only
  ever talks to a local Ollama never downloads the Anthropic SDK. The initial
  bundle contains none of them.

CORS is still the endpoint's decision, as it always was here — nothing is
proxied. A server that sends no `Access-Control-Allow-Origin` cannot be reached
from a browser whichever `api` you pick.

## Listing models

Each family publishes its models differently, and `listModels` knows the
difference:

| `api` | Route and auth | Response |
| --- | --- | --- |
| OpenAI family | `{baseUrl}/models`, `Authorization: Bearer` | `{ data: [{ id }] }` |
| `anthropic-messages` | `{baseUrl}/v1/models`, `x-api-key` + `anthropic-version` | `{ data: [{ id }] }` |
| `mistral-conversations` | `{baseUrl}/v1/models`, `Authorization: Bearer` | `{ data: [{ id }] }` |
| `google-generative-ai` | `{baseUrl}/models?key=…` | `{ models: [{ name: "models/…" }] }`, unqualified to the bare id |

If an endpoint publishes no model route at all, give the provider a static
`models` list instead.

## Registering later

pi documents two timings, and both work here: a call **during the factory** is
applied when the registry is built, and a call **after it returns** — from a
command handler, after a setup flow — takes effect immediately, with no reload.

```ts
pi.registerCommand("connect", {
  description: "Add my endpoint",
  handler: async (_args, ctx) => {
    const key = await ctx.ui.input("API key");
    if (key === undefined) return;
    // The model picker updates on the next render.
    pi.registerProvider("mine", { name: "Mine", baseUrl: "https://mine.example/v1", apiKey: key });
  },
});
```

That is why providers live in a store the host subscribes to rather than in the
frozen registry. A [reload](runtime.md#reloading-is-how-unloading-works) clears
them and re-runs the factories, so registrations do not accumulate.

## How a conversation picks one

Settings gained one optional field:

```ts
type Settings = {
  readonly baseUrl: string;   // the user's own endpoint
  readonly apiKey: string;
  readonly model: string;
  readonly providerId?: string;  // absent → the endpoint above
};
```

An absent `providerId` means the user's own endpoint — which is also exactly how
every settings object saved before providers existed reads, so nothing needed
migrating.

The app resolves that to an endpoint before streaming:

| `providerId` | Streams through |
| --- | --- |
| absent | `baseUrl` / `apiKey` from settings |
| a registered id | that provider's `baseUrl`, with `apiKey` resolved (awaiting the thunk) |
| an id no longer registered | nothing — the composer disables until another model is picked |

That last row matters: a provider disappears when its plugin is disabled or
removed, and a conversation pinned to it has nowhere to go. The app says so
rather than silently falling back to a different endpoint.

## What `@tiny/ai` had to change

Nothing. `streamChat(endpoint, model, messages, options)` has always taken the
endpoint per call, and `listModels(endpoint)` has always listed one endpoint's
models. Only the app was assuming there was exactly one.

## What does not port from pi

pi's `registerProvider` is roughly four features. One of them travels.

| pi has | Here |
| --- | --- |
| base URL, api type and model list | **yes** — including pi's per-model `api` override |
| `auth` with OAuth device-code and `login(interaction)` flows | no — prompt for a key with `ctx.ui.input` instead |
| `fetchModels` with generation-checked `context.publish({ persist })` | no — there is no model catalog store to persist into |
| a native `Provider` from `createProvider` in `pi-ai` | no — `pi-ai` is in the bundle and exports it, but `@tiny/ai` never dispatches through a provider, so one would be ignored |

A useful side effect of the last row: because `@tiny/ai` builds its model
descriptor itself, a bring-your-own endpoint reports `cost: 0` and
`contextWindow: 0`. That is why
[`ctx.getContextUsage()`](context.md#idle-abort-and-usage) returns a zero window
unless an endpoint publishes one.
