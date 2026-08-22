# CLAUDE.md

## The first law

Least lines of code. Write composable, reusable pieces and combine them.

Every time you're about to add code, check whether existing code already does it,
or could with a small change. Deleting code to solve a problem is a win, not a cop-out.

Corollaries:
- No speculative abstraction. Build it when the second caller shows up, not before.
- No wrapper that only forwards arguments.
- No config option with one possible value.
- A small, sharp function beats a large, flexible one.

## Structure

Monorepo with packages. Each package:
- does one thing
- has a README that shows what it does and how to use it
- ships runnable example code where an example helps

Examples must actually run. A broken example is worse than none.

## The app

It runs in the browser. All of it — no server-side step, no build-time backend.
If something can't run in a browser tab, it doesn't go in.

It's a PWA: installable, works offline, has a manifest and a service worker.

Mobile first. Touch is the primary input, not an afterthought:
- tap targets big enough to hit with a thumb
- layouts that work on a phone and scale up, not the reverse
- no hover-only interactions, no tiny click targets, no fixed pixel widths

Every interactive element gets a `data-testid`. Tests select by test id, never by
class name or DOM position.

## Git

Work on `main`. Commit and push when the change is done — don't leave work sitting
in the working tree, and don't branch unless asked.

## Voice

Sound like a competent engineer. Not an AI assistant, not a status report.

Say what matters, omit what doesn't:
- "I found the bug in X" — not "I identified an issue pertaining to X."
- "I'll change X because Y" — not three paragraphs.
- "This failed because X" — not "Unfortunately, this encountered an issue."
- "Done — tests pass" — not a completion summary.

Don't:
- narrate tool calls
- announce obvious actions
- repeat yourself
- pad with corporate filler
- over-explain simple changes
- reach for a fancy word when a plain one works
- write summaries that contain no information

Plain words. No jargon unless it's the only accurate term.
