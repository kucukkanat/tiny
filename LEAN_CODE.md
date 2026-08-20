# Lean code

How this repo is kept readable, and the rules to apply next time.

The measure is **cognitive load**: how much a reader must hold in their head to
change something safely. A person holds about four things at once. Every rule
below is an attempt to spend those four slots on the problem rather than on the
code that describes it.

> Sources: Artem Zakirullin, [*Cognitive load is what
> matters*](https://github.com/zakirullin/cognitive-load); John Ousterhout, *A
> Philosophy of Software Design*; Robert Martin, [*Screaming
> Architecture*](https://blog.cleancoder.com/uncle-bob/2011/09/30/Screaming-Architecture.html).

---

## 1. The test

**A competent but unremarkable engineer should be able to open the repo and
contribute on their first day.** If they are confused for forty minutes without
a break, that is an architecture problem, not a documentation problem. Do not
answer it with a longer README.

Two questions decide most arguments:

- *How many files must I open to answer one question?* One is the target.
- *If I change this, what else must change with it?* Nothing is the target.

---

## 2. Names

A wrong name costs more than a long file. The reader trusts it, and is wrong.

**Name a thing after what it is, not after the language feature or the
framework.** `types.ts` says nothing; `pi.ts` says "the surface a plugin talks
to". `client.ts` contained no client — it contained `streamChat`, so that is its
name now. `hooks/`, `components/` and `storage/` name React, not the app.

**Two things may not share a name.** Not in the same folder, not across
packages. Every collision below cost real time here:

| Was | Read as | Now |
| --- | --- | --- |
| `host.ts` beside `PluginHost.tsx` | the same thing, twice | `registry.ts` |
| `store.ts` in two packages | one concept | `externalStore.ts` / `installed.ts` |
| `ModelOptions` beside `ModelOption` | a plural | `ModelSpec` |
| `memory.ts`, in an LLM repo | conversation memory | `inMemoryRoot.ts` |
| `Thinking` beside `Loader` | both render "Thinking" | `ReasoningTrace` |
| `resolve()` exported | `Promise.resolve` | `decideCall()` |
| `opfs.ts` | the file that touches OPFS | `paths.ts` — it is the one that doesn't |

**Use one word for one concept, end to end.** A value that is `modelOptions`,
then `selectedOptions`, then `options.model`, then `descriptor` is four things to
a reader and one to the compiler. It is `modelSpec` at every hop now.

**Never shadow.** `let tools` (the calls made) next to a `tools` option (the
definitions available) silently resolves to the wrong one. The accumulator is
`toolRuns`.

**A file's name is a promise about its only export.** `ManagerDialog.tsx`
exports `ManagerDialog`. PascalCase `.tsx` when the primary export is a React
component of that exact name; camelCase otherwise.

---

## 3. Structure

**The tree should say what the system does, not what it is built with.** A
reader who opens `apps/chat/src` sees `App`, `Thread`, `useChat`,
`conversations`, `settings`, `plugins/` — the app's nouns. They used to see
`components/`, `hooks/`, `storage/`, which are React's nouns and would be
identical in any other project.

**Flat until it hurts.** A folder earns its existence by having a name a reader
would search for. `plugins/` does. `hooks/` did not — it held one file.

**Put a type next to the code that implements it.** "What is a provider?" should
not need `types.ts` *and* `providers.ts`. Types that describe one idea live with
that idea; only the shared contract lives on its own.

**Do not fragment past the point of clarity.** Many small modules are not free:
you must hold each one's job *and every interaction between them*. Four files
for one sixty-line story is worse than one file. Important functions should be
visibly bigger than trivia — that is how a reader finds them.

---

## 4. Depth

Ousterhout's rule: **the best module has a small interface hiding a lot of
implementation.** A module whose interface is nearly as big as its behaviour is
pure overhead — it adds a name to learn and hides nothing.

Signs of a shallow module here, all since removed:

- A parameter only the tests ever supply. `modelsOf(config, listModels)` took a
  function so tests could pass a stub; the tests now run against a real server
  and the signature is `modelsOf(config)`.
- A type that restates another. `ToolRun` was `StoredToolRun` spelled again.
- A wrapper that forwards. If it only forwards, delete it and call through.

**Prefer named options to positional arguments** once there are more than about
three, or when two are the same type. `useChat` took seven positional arguments,
two of them interchangeable arrays; nothing at the call site said which was
which.

---

## 5. One decision, one place

Information leakage — one design decision written down in two places — is the
red flag that costs the most, because the two copies compile fine and drift
quietly. Look for it in:

- **Lists that must agree.** The events this repo fires were maintained by hand
  in three places. They are now read off the one object that defines them.
- **Formats read by one side and written by the other.** The docs search index
  was typed twice — build and browser — so a field added to one would break
  search with no error anywhere.
- **Magic strings.** `"endpoint"` was a literal in two packages under two names,
  load-bearing, kept in step by a comment.
- **Documentation that transcribes code.** The plugin registry was copied into
  five pages and no copy matched the real file; following the quickstart
  literally turned off the approval gate. Docs now show the line you add and
  point at the file for the rest.

Where a snippet must appear in prose, make the test enforce it — this repo's
docs embed real files verbatim and fail CI when they drift.

**But do not pay for DRY with coupling.** A little copying is better than a
little dependency. The docs app keeps its own copy of the icon rather than
reaching into another app's folder; `RootResolver` was copied *as a name* across
packages, which was the wrong half to share — the lambda type is one line, the
name was the confusion.

---

## 6. Make the compiler carry it

If a rule is only written in a comment, it will be broken.

- `satisfies readonly (keyof T)[]` checks that listed keys are *valid*, not that
  the list is *complete*. A hand-kept key list passed strict TypeScript while
  silently missing a field. Derive from the object instead of restating it.
- An index signature (`[key: string]: unknown`) on a context type lets any
  property compile and crash at runtime. Say exactly what is passed.
- Prefer a shape that cannot be wrong over a check that it isn't. Plugin ids
  came from array position and namespaced user storage, so reordering a list
  moved everyone's data. Now identity comes from the function's own name.

## 7. Errors and fallbacks

**Fail loudly, or fall back honestly — never quietly.** A stub that returns `""`
is a lie if the real value is available: `ui.getEditorText()` returned empty
while the host held the text all along, which made the documented example a
no-op that nobody noticed.

Where a fallback is genuinely right, say so at the definition and make it
uniform, so a reader can tell "not supported here" from "not implemented yet".

---

## 8. Tests

- **One command.** `bun test` at the root, and the same command inside any
  package. Two packages here had no test config at all, so the `bun test` their
  own `package.json` documented failed 38 tests for no reason.
- **One shared setup** — the environment lives in `test/setup.ts`, not in a copy
  per package.
- **Name a test file after what it tests.** `react.test.tsx` and `host.test.ts`
  told you the framework and a file that no longer existed.
- **Do not mock.** Run a real `Bun.serve`, use a real in-memory filesystem. Every
  stub is a place the test can agree with itself and disagree with production.
- **A regression test must fail without the fix.** Check that it does, by
  reverting the fix in place and watching it go red.

---

## 9. Comments

Comment the **why**, never the what. The code says what.

Good comments here explain a decision a reader would otherwise undo: why a
`ref` and not state, why `deny` outranks a remembered `allow`, why a yield has
to come before an await. If a comment describes a hazard, prefer removing the
hazard — a documented footgun is still a footgun.

---

## 10. The checklist

Before opening a pull request:

- [ ] Could a stranger name what each file I touched is for, from its filename?
- [ ] Does any name I introduced already mean something else in this repo?
- [ ] Did I write any fact down twice? Can the compiler hold it instead?
- [ ] Can each question my change raises be answered in one file?
- [ ] Did I delete more than I added? If not, is the addition carrying its weight?
- [ ] Do the docs still describe the code — and does a test say so?
- [ ] `bun run lint && bun run typecheck && bun run test`, and each package on its own.
