# @tiny/extension-fetch

One tool: the model reads a URL.

```
you   → what does the CoinGecko API say bitcoin is worth?
model → fetch { url: "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd" }
      ← 200 application/json — https://api.coingecko.com/…
        {"bitcoin":{"usd":80329}}
```

## What it sends

```ts
{
  url: 'https://example.com/thing',   // http or https, nothing else
  method: 'GET',                       // or HEAD, POST, PUT, PATCH, DELETE
  headers: { accept: 'application/json' },
  body: '{"name":"x"}',                // already serialised; set Content-Type yourself
}
```

Every method is allowed and none of them asks first, so the model can change
things. The `instructions` tell it to confirm a write in the conversation
before making one, which is guidance, not a gate — if that isn't the trade you
want, this is the extension to switch off.

## What comes back

```ts
{
  url: 'https://example.com/thing',  // final, after redirects
  status: 200,
  ok: true,
  contentType: 'text/html; charset=utf-8',
  headers: { … },                    // all of them
  kind: 'html',                      // 'json' | 'html' | 'text' | 'binary'
  body: 'Prices\n\nBTC\n\nUp today', // markup stripped, for html
  bytes: 48210,
  truncated: false,
  ms: 214,
}
```

Bodies are read by content type, not by asking:

| Type                        | What the model gets                                            |
| --------------------------- | -------------------------------------------------------------- |
| `application/json`, `+json` | the JSON, untouched                                            |
| `text/html`                 | `<title>` and the readable text; script, style and svg removed |
| `text/*`, xml, ndjson       | the text, untouched                                            |
| anything else               | `"48210 bytes of image/png, not text."`                        |

Cut at 40,000 characters — about 10k tokens, because a body is spent in the
model's context on every turn after the one that fetched it. `bytes` still
reports what actually arrived, so the gap is visible.

The header map and the timing are drawn in the reply but never sent to the
model; `toModelOutput` sends the status line and the body and nothing else.

## CORS

This runs in a browser tab with no server behind it, so a cross-origin read
only works when the site sends `Access-Control-Allow-Origin`. Most public APIs
do. Most web pages do not.

There is deliberately no proxy. Routing a URL through a third party to get
around this would mean every address and every response the model reads passes
through a host the user never chose, and the app cannot tell them what it did
with it. So a blocked read fails, and says why:

> Could not read https://example.com/. This app is a browser tab with no server
> behind it, so a cross-origin read only works when the site sends
> Access-Control-Allow-Origin — most pages do not, and most public APIs do.
> There is no proxy to fall back to, so retrying this URL will fail the same
> way. Try an API for the same data, or tell the user what to open themselves.

That wording is the feature. `fetch` rejects with a bare `TypeError: Failed to
fetch` for a blocked read, a dead host and a refused connection alike, and a
model given only that retries the same URL until it gives up.

## The drawing

`View` renders the response instead of its JSON: the method and status as a
chip that goes red on a failure, the final URL, the kind, size and timing, and
the body in a scrolling block. The raw input and output stay one press below
it, which is where you look when a drawing says something you don't believe.
