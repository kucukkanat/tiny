# @tiny/ui

React primitives for AI chat interfaces, adapted from
[Beautiful UI](https://www.beautifului.dev/) (MIT) — the loader, thinking trace,
streamed text, composer, sidebar, and the gliding hover highlight, driven
entirely by props. Styling is Tailwind 4 + the Beautiful UI design tokens.

## Setup

Import the tokens once in your app CSS (they define the palette in light and
dark via `prefers-color-scheme`, the Tailwind `@theme` mapping, and keyframes):

```css
@import "tailwindcss";
@import "@tiny/ui/tokens.css";
```

## Components

Each block below is a complete component from [`examples/`](examples) — drop the
file into an app, render it, and it works. Every one is rendered by the test
suite, so these compile and run rather than merely reading well.

### StreamText

Streaming answer text, rendered as markdown — headings, lists, links,
blockquotes, GFM tables and fenced code all render as you would expect, while
each word still resolves out of blur as it arrives and the caret blinks until
`done`. Raw HTML in the text is left as text, since model output is untrusted.
`examples/StreamTextExample.tsx`:

```tsx path=packages/ui/examples/StreamTextExample.tsx
import { StreamText } from "@tiny/ui";
import { useEffect, useState } from "react";

const REPLY = `### Why the sky is blue

Air scatters **short** wavelengths hardest, so blue reaches you from every
direction:

- Rayleigh scattering goes as \`1 / λ⁴\`
- Violet scatters more still, but the eye is less sensitive to it

| Wavelength | Colour | Scattering |
| ---------- | ------ | ---------- |
| 450 nm     | blue   | high       |
| 650 nm     | red    | low        |
`;

/** Reveals a markdown reply word by word, then drops the caret once it is done. */
export function StreamTextExample() {
  const [wordCount, setWordCount] = useState(0);
  const words = REPLY.split(" ");
  const done = wordCount >= words.length;

  // One interval reveals the whole reply; `done` flipping tears it down.
  useEffect(() => {
    if (done) return;
    const timer = setInterval(() => setWordCount((count) => count + 1), 120);
    return () => clearInterval(timer);
  }, [done]);

  return <StreamText text={words.slice(0, wordCount).join(" ")} done={done} />;
}
```

### ReasoningTrace

Expandable reasoning trace — shimmers while `working`, then settles into
"Thought for Ns" and stays expandable. `examples/ReasoningTraceExample.tsx`:

```tsx path=packages/ui/examples/ReasoningTraceExample.tsx
import { ReasoningTrace } from "@tiny/ui";
import { useEffect, useState } from "react";

/** Shimmers while the model reasons, then settles into "Thought for Ns". */
export function ReasoningTraceExample() {
  const [seconds, setSeconds] = useState(0);
  const working = seconds < 4;

  useEffect(() => {
    if (!working) return;
    const timer = setTimeout(() => setSeconds((value) => value + 1), 1000);
    return () => clearTimeout(timer);
  }, [working]);

  return (
    <ReasoningTrace
      working={working}
      seconds={seconds}
      text={"Checking what makes the sky blue.\nRayleigh scattering, most likely."}
    />
  );
}
```


### ApprovalCard

The question an agent asks before it acts, rendered **inline in the reply** rather
than over the app — a modal interrupts the whole page for a decision that belongs
to one tool call. Radio rows, a free-text row among them for saying what to do
instead, an optional "always for this tool" box, and an arrow that lights up once
there is something to send. Choosing arms the arrow rather than sending on a
timer, unlike the original: this is a permission gate, and a mis-click should not
be able to spend money. `examples/ApprovalCardExample.tsx`:

```tsx path=packages/ui/examples/ApprovalCardExample.tsx
import { ApprovalCard } from "@tiny/ui";
import { useState } from "react";

/** Asks before the agent writes, then reports what was decided. */
export function ApprovalCardExample() {
  const [outcome, setOutcome] = useState<string | undefined>(undefined);

  if (outcome !== undefined) return <p className="text-base text-ink-2">{outcome}</p>;

  return (
    <ApprovalCard
      question="Run Write File?"
      detail={
        <pre className="rounded-control bg-field p-2 font-mono text-xs text-ink-2">
          {JSON.stringify({ path: "/notes/hello.md", content: "hi" }, null, 2)}
        </pre>
      }
      options={[
        { id: "approve", label: "Run it" },
        { id: "deny", label: "Don't run it", tone: "danger" },
      ]}
      notePlaceholder="Or tell the model what to do instead…"
      rememberLabel="Always for fs_write"
      onSubmit={({ optionId, note, remember }) =>
        setOutcome(
          `${optionId}${note === "" ? "" : ` — "${note}"`}${remember ? " (remembered)" : ""}`,
        )
      }
      onDismiss={() => setOutcome("dismissed, which denies")}
    />
  );
}
```

### Loader

Pixel-grid loader with its own elapsed timer. `examples/LoaderExample.tsx`:

```tsx path=packages/ui/examples/LoaderExample.tsx
import { Loader } from "@tiny/ui";
import { useEffect, useState } from "react";

/** The pixel-grid loader runs its own elapsed timer; it only needs a label. */
export function LoaderExample() {
  const [waiting, setWaiting] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setWaiting(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  return waiting ? <Loader label="Waiting for model" /> : <p>Done.</p>;
}
```

### PromptBar

Composer with model picker; Enter sends, Shift+Enter breaks the line, and the
send button becomes stop while `busy`. `examples/PromptBarExample.tsx`:

```tsx path=packages/ui/examples/PromptBarExample.tsx
import { PromptBar } from "@tiny/ui";
import { useRef, useState } from "react";

const MODELS = [
  { value: "gpt-4.1", label: "gpt-4.1" },
  { value: "gpt-4.1-mini", label: "gpt-4.1-mini" },
] as const;

/** The send button becomes a stop button while `busy`; stopping aborts. */
export function PromptBarExample() {
  const [model, setModel] = useState<string>(MODELS[0].value);
  const [busy, setBusy] = useState(false);
  // The draft is controlled — PromptBar keeps no copy of it.
  const [draft, setDraft] = useState("");
  const [sent, setSent] = useState<readonly string[]>([]);
  const controller = useRef<AbortController>(new AbortController());

  const send = (text: string) => {
    setSent((all) => [...all, text]);
    setBusy(true);
    controller.current = new AbortController();
    // Stand-in for a real request; a stream would clear `busy` when it ends.
    setTimeout(() => setBusy(false), 2000);
  };

  return (
    <>
      {sent.map((text) => (
        <p key={text}>{text}</p>
      ))}
      <PromptBar
        onSend={send}
        busy={busy}
        onStop={() => {
          controller.current.abort();
          setBusy(false);
        }}
        models={MODELS}
        model={model}
        onModelChange={setModel}
        text={draft}
        onTextChange={setDraft}
      />
    </>
  );
}
```

### Sidebar

Collapsible chat rail — new chat, history, settings.
`examples/SidebarExample.tsx`:

```tsx path=packages/ui/examples/SidebarExample.tsx
import { Sidebar, type SidebarChat } from "@tiny/ui";
import { useState } from "react";

const INITIAL: readonly SidebarChat[] = [
  { id: "1", title: "Why is the sky blue?" },
  { id: "2", title: "Refactor the parser" },
];

/** The rail owns its collapsed state; the chat list stays yours. */
export function SidebarExample() {
  const [chats, setChats] = useState(INITIAL);
  const [activeId, setActiveId] = useState<string | undefined>("1");

  return (
    <Sidebar
      title="Tiny"
      chats={chats}
      activeId={activeId}
      onSelect={setActiveId}
      onNew={() => {
        const chat = { id: String(chats.length + 1), title: "Untitled chat" };
        setChats((all) => [chat, ...all]);
        setActiveId(chat.id);
      }}
      onDelete={(id) => {
        setChats((all) => all.filter((chat) => chat.id !== id));
        setActiveId((current) => (current === id ? undefined : current));
      }}
      onSettings={() => console.log("open settings")}
    />
  );
}
```

### GlideMenu

The gliding hover highlight, standalone — wrap rows marked `data-row`.
`examples/GlideMenuExample.tsx`:

```tsx path=packages/ui/examples/GlideMenuExample.tsx
import { GlideMenu } from "@tiny/ui";

const ACTIONS = ["Rename", "Duplicate", "Delete"] as const;

/**
 * One highlight glides between rows instead of each row lighting up on its own.
 * Rows opt in with `data-row`, and need `relative z-10` to sit above it.
 */
export function GlideMenuExample() {
  return (
    <GlideMenu className="flex w-48 flex-col p-1">
      {ACTIONS.map((action) => (
        <button
          key={action}
          type="button"
          data-row
          className="relative z-10 h-8 rounded-control px-2 text-left"
          onClick={() => console.log(action)}
        >
          {action}
        </button>
      ))}
    </GlideMenu>
  );
}
```

`ShimmerLabel` is exported too — the shimmering text used by `Loader` and
`ReasoningTrace`, if you need it on its own.

## Test

```sh
bun test
```

Every example above is rendered by the suite, and the README is asserted to
embed each file verbatim.
