import type { ChatRole, ToolStatus } from "@tiny/ai";
import { createStore, del, entries, get, set } from "idb-keyval";

/** A tool call the model made while producing a reply. */
export type StoredToolRun = {
  readonly id: string;
  readonly name: string;
  readonly status: ToolStatus;
  readonly summary: string;
};

export type StoredMessage = {
  readonly role: ChatRole;
  readonly content: string;
  /** Model reasoning captured while streaming, when the model exposes it. */
  readonly reasoning?: string;
  readonly reasoningSeconds?: number;
  /** Absent on replies that called nothing, which is most of them. */
  readonly tools?: readonly StoredToolRun[];
};

export type Conversation = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: number;
  readonly messages: readonly StoredMessage[];
};

const store = createStore("tiny-chat", "conversations");

export const newConversationId = (): string => crypto.randomUUID();

/** First user line, trimmed to something that fits the sidebar. */
export const titleFrom = (text: string): string => {
  const line = text.trim().split("\n", 1)[0] ?? "";
  return line.length > 48 ? `${line.slice(0, 48)}…` : line || "New chat";
};

export const getConversation = (id: string): Promise<Conversation | undefined> =>
  get<Conversation>(id, store);

export const putConversation = (conversation: Conversation): Promise<void> =>
  set(conversation.id, conversation, store);

export const deleteConversation = (id: string): Promise<void> => del(id, store);

/** All conversations, newest first — the sidebar order. */
export async function listConversations(): Promise<readonly Conversation[]> {
  const all = await entries<string, Conversation>(store);
  return all.map(([, conversation]) => conversation).toSorted((a, b) => b.updatedAt - a.updatedAt);
}
