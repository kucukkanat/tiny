import type { ToolStatus } from "@tiny/ai";
import { type MarkdownContext, Slot, useMarkdown } from "@tiny/plugin";
import { Loader, StreamText, Thinking } from "@tiny/ui";
import { useEffect, useMemo, useRef } from "react";
import type { Streaming } from "../hooks/useChat.ts";
import type { StoredMessage, StoredToolRun } from "../storage/conversations.ts";

const toolTone: Record<ToolStatus, string> = {
  running: "text-ink-3",
  ok: "text-ink-2",
  error: "text-red",
};

const toolMark: Record<ToolStatus, string> = { running: "…", ok: "✓", error: "✗" };

/** One line per tool call: what ran, and how it went. */
function Tools({ runs }: { runs: readonly StoredToolRun[] }) {
  if (runs.length === 0) return null;
  return (
    <div className="flex flex-col gap-0.5" data-testid="tool-runs">
      {runs.map((run) => (
        <div
          key={run.id}
          className={`flex items-baseline gap-1.5 font-mono text-xs ${toolTone[run.status]}`}
        >
          <span aria-hidden>{toolMark[run.status]}</span>
          <span className="font-medium">{run.name}</span>
          <span className="min-w-0 flex-1 truncate opacity-80">{run.summary}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * One message's text, after every `registerMarkdownTransformer` has had a turn.
 *
 * Display-only, exactly as in pi: the original text is what stays in the
 * conversation and in the model's context.
 */
function Transformed({ text, context }: { text: string; context: MarkdownContext }) {
  return <>{useMarkdown(text, context)}</>;
}

function Assistant({
  content,
  reasoning,
  reasoningSeconds,
  done,
  reasoningLive,
  tools,
  message,
  index,
}: {
  content: string;
  reasoning: string | undefined;
  reasoningSeconds: number;
  done: boolean;
  reasoningLive: boolean;
  tools: readonly StoredToolRun[];
  message?: StoredMessage;
  index?: number;
}) {
  // `isStreaming` is pi's flag for a partial assistant update, so a transformer
  // can skip work until the text settles.
  const body = useMarkdown(
    content,
    useMemo(() => ({ messageType: "assistant", isStreaming: !done }) as const, [done]),
  );
  const thinking = useMarkdown(
    reasoning ?? "",
    useMemo(
      () => ({ messageType: "assistant-thinking", isStreaming: reasoningLive }) as const,
      [reasoningLive],
    ),
  );

  return (
    <div className="flex flex-col gap-1">
      {reasoning !== undefined && reasoning !== "" && (
        <Thinking working={reasoningLive} seconds={reasoningSeconds} text={thinking} />
      )}
      <Tools runs={tools} />
      {(content !== "" || done) && <StreamText text={body} done={done} />}
      {/* Only finished replies carry actions — there is nothing to copy or
          retry while the tokens are still arriving. */}
      {done && message !== undefined && (
        <div className="flex items-center gap-1">
          <Slot name="message.actions" message={message} index={index} />
        </div>
      )}
    </div>
  );
}

/** Stable, so the transform memo in `Transformed` is not defeated per message. */
const USER_MESSAGE: MarkdownContext = { messageType: "user", isStreaming: false };

export function Thread({
  messages,
  streaming,
  error,
}: {
  messages: readonly StoredMessage[];
  streaming: Streaming | undefined;
  error: string | undefined;
}) {
  const endRef = useRef<HTMLDivElement>(null);
  const lastLength = streaming?.text.length ?? streaming?.reasoning.length ?? 0;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll follows content growth
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, lastLength]);

  // A run that has only called tools so far is working, not waiting.
  const waiting =
    streaming !== undefined &&
    streaming.reasoning === "" &&
    streaming.text === "" &&
    streaming.tools.length === 0;

  return (
    <div className="flex flex-col gap-4 py-5">
      {/* biome-ignore-start lint/suspicious/noArrayIndexKey: the thread is append-only, so positions are stable identities */}
      {messages.map((message, index) =>
        message.role === "user" ? (
          <div key={index} className="flex justify-end pl-14">
            <div className="rounded-xl bg-field px-3 py-1.5 text-base leading-[1.4] whitespace-pre-wrap text-ink">
              <Transformed text={message.content} context={USER_MESSAGE} />
            </div>
          </div>
        ) : (
          <Assistant
            key={index}
            content={message.content}
            reasoning={message.reasoning}
            reasoningSeconds={message.reasoningSeconds ?? 0}
            done
            reasoningLive={false}
            tools={message.tools ?? []}
            message={message}
            index={index}
          />
        ),
      )}
      {/* biome-ignore-end lint/suspicious/noArrayIndexKey: see above */}

      {streaming !== undefined && (
        <>
          {waiting ? (
            <Loader label="Waiting for model" />
          ) : (
            <Assistant
              content={streaming.text}
              reasoning={streaming.reasoning}
              reasoningSeconds={streaming.reasoningSeconds}
              done={false}
              reasoningLive={streaming.text === ""}
              tools={streaming.tools}
            />
          )}
          {/* Outside the branch above on purpose: a reply can be waiting on the
              user before any delta has arrived, and a question the run is parked
              on must render either way. Inside `Assistant` it would depend on
              `streamChat` happening to yield a tool delta first. */}
          <Slot name="message.pending" />
        </>
      )}

      {error !== undefined && (
        <p role="alert" className="text-smd text-red">
          {error}
        </p>
      )}
      <div ref={endRef} />
    </div>
  );
}
