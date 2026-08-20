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
