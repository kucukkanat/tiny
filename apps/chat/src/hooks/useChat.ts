import type {
  ChatMessage,
  Endpoint,
  Extension,
  ModelOptions,
  ToolDefinition,
  ToolStatus,
} from "@tiny/ai";
import { describeError, streamChat } from "@tiny/ai";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Conversation,
  getConversation,
  newConversationId,
  putConversation,
  type StoredMessage,
  titleFrom,
} from "../storage/conversations.ts";

/** One tool call the model made during a reply. */
export type ToolRun = {
  readonly id: string;
  readonly name: string;
  readonly status: ToolStatus;
  readonly summary: string;
};

/** The in-flight assistant reply, rendered live while streaming. */
export type Streaming = {
  readonly reasoning: string;
  readonly text: string;
  readonly reasoningSeconds: number;
  readonly tools: readonly ToolRun[];
};

const toChatMessages = (stored: readonly StoredMessage[]): ChatMessage[] =>
  stored.map(({ role, content }) => ({ role, content }));

export function useChat(
  conversationId: string | undefined,
  /**
   * Where this conversation streams from — the user's own endpoint, or one a
   * plugin registered with `pi.registerProvider`. Resolved by `App`, because
   * only it can see both the settings and the provider registry.
   */
  endpoint: Endpoint | undefined,
  model: string,
  onConversationCreated: (id: string) => void,
  /**
   * Supplied by the plugin host, which is the one place plugin factories run.
   * Defaults to none so a screen or a test can drive the hook on its own.
   */
  extensions: readonly Extension[] = [],
  /** Tools the model may call, also collected by the plugin host. */
  toolDefinitions: readonly ToolDefinition[] = [],
  /** What a provider knows about this model that its endpoint cannot publish. */
  modelOptions: ModelOptions = {},
) {
  const [messages, setMessages] = useState<readonly StoredMessage[]>([]);
  const [streaming, setStreaming] = useState<Streaming | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const selfIdRef = useRef<string | undefined>(undefined);

  // Load the conversation whenever the route changes; abort any stream from the
  // previous one. Skip the id this hook just created itself — that navigation
  // happens mid-stream and must not abort or clobber the live reply.
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
      let tools: readonly ToolRun[] = [];
      setStreaming({ reasoning, text: answer, reasoningSeconds, tools });

      try {
        for await (const delta of streamChat(endpoint, model, toChatMessages(history), {
          signal: controller.signal,
          extensions,
          tools: toolDefinitions,
          model: modelOptions,
        })) {
          if (delta.kind === "reasoning") {
            reasoningStarted ??= Date.now();
            reasoning += delta.text;
          } else if (delta.kind === "tool") {
            // A call is announced as "running" and then replaced in place, so
            // the row updates rather than the list growing twice per call.
            const { id, name, status, summary } = delta;
            tools = tools.some((run) => run.id === id)
              ? tools.map((run) => (run.id === id ? { id, name, status, summary } : run))
              : [...tools, { id, name, status, summary }];
          } else {
            if (reasoningStarted !== undefined && reasoningSeconds === 0)
              reasoningSeconds = Math.max(1, Math.round((Date.now() - reasoningStarted) / 1000));
            answer += delta.text;
          }
          setStreaming({ reasoning, text: answer, reasoningSeconds, tools });
        }
      } catch (caught) {
        if (!controller.signal.aborted) setError(describeError(caught));
      } finally {
        abortRef.current = undefined;
        setStreaming(undefined);
        if (reasoning !== "" || answer !== "" || tools.length > 0) {
          const assistant: StoredMessage = {
            role: "assistant",
            content: answer,
            ...(reasoning !== "" ? { reasoning, reasoningSeconds } : {}),
            ...(tools.length > 0 ? { tools } : {}),
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
      toolDefinitions,
      modelOptions,
      messages,
      onConversationCreated,
      streaming,
    ],
  );

  return { messages, streaming, error, send, stop } as const;
}
