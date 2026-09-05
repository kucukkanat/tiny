# @tiny/extension-starter

A working extension that uses every slot there is. Copy it, change the id, and it
is yours.

It is the same kind of package as `extension-chat` or `extension-settings`. The
only difference is that `packages/app/src/extensions.tsx` doesn't list it, so it
is built on its own and installed from a URL like anything else — which is what
makes it the example.

```sh
bun --filter @tiny/extension-starter build   # → packages/app/dist/extensions/starter.js
```

It ships with the app, so the Extensions screen offers it as "Try the example
one" and installs it from `./extensions/starter.js` — same origin, nothing to
configure.

## What is in it

- **`roll_dice`** and **`ask_me`** — two tools, one that computes and one that
  asks you a question and waits for the answer
- **A screen** at `/#/starter` that reads your past conversations and asks the
  model to sum them up, using `tiny.useChats()` and `tiny.useModel()`
- **A Gemini provider**, so Settings offers it beside Anthropic and OpenAI
- **A chat action**, offered when you highlight a passage of a reply
- **`instructions`**, a line added to the model's system prompt
- **Its own CSS**, generated against the app's tokens

The Gemini provider is most of the weight: `@ai-sdk/google` is bundled in, which
is why the built file is around 80 kB gzipped. An extension with only tools and a
screen is a couple of kilobytes. Delete the `providers` block and see.

## Copying it out

Change one line. `@tiny/host` is `workspace:*` here because it lives in
this repo; outside it, point at the tarball the deploy publishes:

```json
"@tiny/host": "https://kucukkanat.github.io/tiny/pkg/tiny-host-0.2.0.tgz"
```

It is types only — nothing from it is in your built file.

## Working on one

Three terminals, all on `http://localhost`, which is also the only arrangement
Safari will allow: it refuses to load `http://` from an `https://` page, and
scripts are not one of the things it will upgrade.

```sh
bun dev                                        # the app, :5173
bun --filter @tiny/extension-starter build --watch
bunx vite preview --outDir ../app/dist/extensions --port 4173
```

Then install `http://localhost:4173/starter.js`. Vite's preview server already
sends CORS headers to localhost, so there is nothing to configure.

**Do not run `vite dev` for an extension.** It rewrites `react` to a path on the
extension's own origin, so the app's import map never sees it, you get a second
React, and the only symptom is `Invalid hook call`. It is the first thing
everyone tries.

Press Reload on the extension's page in the app to pick up a new build — that
bumps the version in the URL, which is what gets past the module map.

## Publishing

Tag it and let jsDelivr serve it:

```sh
git tag v1 && git push --tags
# https://cdn.jsdelivr.net/gh/<you>/<repo>@v1/dist/extension.js
```

A tag or a commit, never a branch: a branch address is cached in the browser for
seven days, so your fix would look like it did nothing. Share it as an install
link, which lands on the page describing what it adds, switched off:

```
https://kucukkanat.github.io/tiny/#/extensions/install?url=<the url, encoded>
```

## When it will not load

| What you see                         | What it means                                           |
| ------------------------------------ | ------------------------------------------------------- |
| `Failed to resolve module specifier` | you imported something you didn't bundle                |
| MIME type of `text/plain`            | raw.githubusercontent or a gist — use jsDelivr or Pages |
| `Invalid hook call`                  | react wasn't marked external                            |
| `No default export`                  | the module has to default-export a function of the host |
