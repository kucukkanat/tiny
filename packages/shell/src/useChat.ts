import type { ChatMessage, Endpoint, Extension, ModelSpec, ToolDefinition } from "@tiny/ai";
import { describeError, streamChat } from "@tiny/ai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Conversation,
  getConversation,
  newConversationId,
  putConversation,
  type StoredMessage,
  type StoredToolRun,
  titleFrom,
} from "./conversations.ts";

/** The in-flight assistant reply, rendered live while streaming. */
export type Streaming = {
  readonly reasoning: string;
  readonly text: string;
  readonly reasoningSeconds: number;
  readonly tools: readonly StoredToolRun[];
};

const toChatMessages = (stored: readonly StoredMessage[]): ChatMessage[] =>
  stored.map(({ role, content }) => ({ role, content }));

export type ChatOptions = {
  readonly conversationId: string | undefined;
  /** Resolved by `ChatShell`, which alone sees both settings and the provider registry. */
  readonly endpoint: Endpoint | undefined;
  readonly model: string;
  onConversationCreated(id: string): void;
  /** Supplied by the plugin host; optional so a screen or test can drive the hook alone. */
  readonly extensions?: readonly Extension[];
  /** Tools the model may call, also collected by the plugin host. */
  readonly tools?: readonly ToolDefinition[];
  /** What a provider knows about this model that its endpoint cannot publish. */
  readonly modelSpec?: ModelSpec;
};

/** One conversation: its messages, the reply in flight, and how to send. */
export function useChat({
  conversationId,
  endpoint,
  model,
  onConversationCreated,
  extensions = [],
  tools = [],
  modelSpec = {},
}: ChatOptions) {
  const [messages, setMessages] = useState<readonly StoredMessage[]>([]);
  const [streaming, setStreaming] = useState<Streaming | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const selfIdRef = useRef<string | undefined>(undefined);

  // Load on route change, aborting the previous stream — except the id this hook
  // just created, whose navigation happens mid-stream and must not clobber the reply.
  useEffect(() => {
    if (conversationId !== undefined && conversationId === selfIdRef.current) return;
    selfIdRef.current = undefined;
    abortRef.current?.abort();
    setStreaming(undefined);
    setError(undefined);
    if (conversationId === undefined) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    getConversation(conversationId).then((conversation) => {
      if (!cancelled) setMessages(conversation?.messages ?? []);
    });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const send = useCallback(
    async (text: string) => {
      if (endpoint === undefined || model === "" || streaming !== undefined) return;
      setError(undefined);

      const id = conversationId ?? newConversationId();
      const userMessage: StoredMessage = { role: "user", content: text };
      const history = [...messages, userMessage];
      setMessages(history);

      const persist = async (all: readonly StoredMessage[]) => {
        const existing = await getConversation(id);
        const conversation: Conversation = {
          id,
          title: existing?.title ?? titleFrom(text),
          updatedAt: Date.now(),
          messages: all,
        };
        await putConversation(conversation);
      };
      await persist(history);
      if (conversationId === undefined) {
        selfIdRef.current = id;
        onConversationCreated(id);
      }

      const controller = new AbortController();
      abortRef.current = controller;
      let reasoning = "";
      let answer = "";
      let reasoningStarted: number | undefined;
      let reasoningSeconds = 0;
      // The tool *calls* this reply made — distinct from `tools`, the definitions.
      let toolRuns: readonly StoredToolRun[] = [];
      setStreaming({ reasoning, text: answer, reasoningSeconds, tools: toolRuns });

      try {
        for await (const delta of streamChat(endpoint, model, toChatMessages(history), {
          signal: controller.signal,
          extensions,
          tools,
          modelSpec,
        })) {
          if (delta.kind === "reasoning") {
            reasoningStarted ??= Date.now();
            reasoning += delta.text;
          } else if (delta.kind === "tool") {
            // Announced as "running", then replaced in place so the row updates.
            const { id, name, status, summary } = delta;
            toolRuns = toolRuns.some((run) => run.id === id)
              ? toolRuns.map((run) => (run.id === id ? { id, name, status, summary } : run))
              : [...toolRuns, { id, name, status, summary }];
          } else {
            if (reasoningStarted !== undefined && reasoningSeconds === 0)
              reasoningSeconds = Math.max(1, Math.round((Date.now() - reasoningStarted) / 1000));
            answer += delta.text;
          }
          setStreaming({ reasoning, text: answer, reasoningSeconds, tools: toolRuns });
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(describeError(caught));
      } finally {
        abortRef.current = undefined;
        setStreaming(undefined);
        if (reasoning !== "" || answer !== "" || toolRuns.length > 0) {
          const assistant: StoredMessage = {
            role: "assistant",
            content: answer,
            ...(reasoning !== "" ? { reasoning, reasoningSeconds } : {}),
            ...(toolRuns.length > 0 ? { tools: toolRuns } : {}),
          };
          const all = [...history, assistant];
          setMessages(all);
          await persist(all);
        }
      }
    },
    [
      conversationId,
      endpoint,
      model,
      extensions,
      tools,
      modelSpec,
      messages,
      onConversationCreated,
      streaming,
    ],
  );

  return { messages, streaming, error, send, stop } as const;
}
