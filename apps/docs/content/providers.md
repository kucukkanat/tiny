# Providers

`registerProvider` adds another OpenAI-compatible endpoint to the model picker.
The user keeps their own endpoint in settings; a plugin can add as many more as
it likes, and each conversation remembers which one it belongs to.

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
  readonly models?:
    | readonly string[]
    | ((signal: AbortSignal | undefined) => Promise<readonly string[]>);
};
```

| Field | Notes |
| --- | --- |
| `name` | the group heading in the picker |
| `baseUrl` | anything OpenAI-compatible; `http://localhost:11434/v1` works |
| `apiKey` | a string, or a thunk resolved when a request needs it. Omit it for a local server that wants none |
| `models` | a fixed list, or a lookup. **Omit it** and the endpoint's own `/models` route is asked, which is what an OpenAI-compatible server publishes |

Prefer the thunk form for `apiKey`. A key passed as a string sits in the registry,
where `ctx.settings` would put it in reach of every other plugin; a thunk is called
only when a request is about to go out.

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
| base URL and model list | **yes** |
| `auth` with OAuth device-code and `login(interaction)` flows | no — prompt for a key with `ctx.ui.input` instead |
| `fetchModels` with generation-checked `context.publish({ persist })` | no — there is no model catalog store to persist into |
| a native `Provider` from `createProvider` in `pi-ai` | no — `pi-ai` is in the bundle and exports it, but `@tiny/ai` never dispatches through a provider, so one would be ignored |

A useful side effect of the last row: because `@tiny/ai` builds its model
descriptor itself, a bring-your-own endpoint reports `cost: 0` and
`contextWindow: 0`. That is why
[`ctx.getContextUsage()`](context.md#idle-abort-and-usage) returns a zero window
unless an endpoint publishes one.
