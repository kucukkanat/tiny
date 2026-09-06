# @tiny/extension-author

The model writes extensions.

It gets the verbs the Extensions screen has — list, read, write, delete — and not
the one it hasn't. What it writes lands as a row that is **switched off**, with a
card in the reply linking to the switch. Turning it on is a press, by a person,
the same as an install link.

## The loop

> **you** — make me a tool that reverses text
>
> **model** — _calls `extension_docs`, then `write_extension`_
>
> ```
> ┌──────────────────────────────────────────────┐
> │ Reverse                                      │
> │ Written — off until you turn it on    [Open] │
> └──────────────────────────────────────────────┘
> ```
>
> Press **Open**, read the source, flip the switch. The tool answers on your next
> message.

Ask for a change and it calls `write_extension` again with the same id: the
source is replaced, the version bumps so a fresh module is minted out of it, and
the switch stays exactly where you left it.

## The tools

| tool               | does                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `extensions`       | every installed row: id, title, on or off, and its size or its URL  |
| `read_extension`   | the source of one, so it can edit rather than rewrite               |
| `write_extension`  | compile, then save. An id replaces; no id creates, off              |
| `delete_extension` | removes one for good                                                |
| `extension_docs`   | the whole authoring guide — the slots, `tiny`, what may be imported |

## Why it compiles before it saves

`write_extension` runs `transformJsx` on the source and rethrows what comes back.
A stray tag is `unclosed <div> (3:4)` in the same turn, instead of a broken row
that fails silently until someone presses Run three days later.

Nothing is stored when the compile fails.

## Two things it will not do

**Turn one on.** There is no tool for it, and there will not be. The whole
security model of this app is that you can see what an extension does before it
runs; a model that could write code and start it removes the only place that is
visible.

**Write over one you installed from a URL.** That row carries an address, not a
body. Writing source onto it would leave it holding both, which is a shape the
store drops on the next read — so the row would vanish rather than fail. Delete
it first if you mean to replace it.

## Docs, not instructions

`instructions` is in the system prompt on every turn of every conversation, so
this extension's is three sentences: the tools exist, the source is JavaScript
with JSX and never TypeScript, and what gets written is off.

Everything else — the eight members of `Tiny`, the ten slots on `Extension`, the
five bare specifiers, the `{ ...tool(), View }` shape — is behind
`extension_docs`, which costs nothing until the model asks. It lives in
[`src/docs.ts`](src/docs.ts), built from tables typed `Record<keyof Tiny, string>`
and `Record<keyof Extension, string>`: adding a member to the contract fails this
build until the guide catches up.

## Turning it off

It is a bundled extension like any other, so the switch on the Extensions screen
takes the five tools and their instructions out of every conversation. Off means
hidden, not gone — it is still in the build.
