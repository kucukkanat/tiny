# @tiny/plugin-trace

Three plugins that **watch** and change nothing.

| Plugin | Does |
| --- | --- |
| `usageLogger(log?)` | reports tokens, and cost when the endpoint priced the call, once a reply completes |
| `streamTrace(log?)` | counts pi's raw token-level events per reply — a no-op in production builds |
| `approvalLog(log?)` | records every tool call the approval gate settles, and how it was settled |

That none of them can alter what the model is sent is the reason they are their
own package: they are safe to leave on.

`approvalLog` watches another *plugin* rather than the request. It reaches
[`@tiny/plugin-hitl`](../plugin-hitl) over `tiny.events`, importing one exported
channel — `approvalDecided` — and nothing else, so the two need not be listed in
any particular order and either can be removed without touching the other. With
no approval plugin installed there is nothing publishing, and it logs nothing. The pair that *does* rewrite the request
lives in [`@tiny/plugin-prompt`](../plugin-prompt), so the difference is a
dependency rather than a comment you have to notice.

## Usage

`examples/watch-a-reply.ts`:

```ts path=packages/plugin-trace/examples/watch-a-reply.ts
import { streamChat } from "@tiny/ai";
import { loadPlugins } from "@tiny/plugin";
import { streamTrace, usageLogger } from "@tiny/plugin-trace";

// Both plugins only listen, so the request below is byte-for-byte the request
// you would have sent without them. That is the whole contract of this package.
const seen: string[] = [];
const { extensions } = await loadPlugins([usageLogger((line) => seen.push(line)), streamTrace()]);

const endpoint = { baseUrl: process.env.BASE_URL ?? "http://localhost:8787/v1", apiKey: "sk-test" };
for await (const _delta of streamChat(
  endpoint,
  "mock-tool-caller",
  [{ role: "user", content: "hello" }],
  { extensions },
));

console.log(seen.join("\n")); // [usage] 10 in + 5 out = 15 tokens
```

## Test

```sh
bun test
```
