import type { ApiType } from "./apis.ts";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  readonly role: ChatRole;
  readonly content: string;
};

/** Connection details for one endpoint. */
export type Endpoint = {
  /** e.g. "https://api.openai.com/v1" — with or without trailing slash. */
  readonly baseUrl: string;
  readonly apiKey: string;
  /** Which pi streaming implementation the endpoint speaks; defaults to `openai-completions`. */
  readonly api?: ApiType | undefined;
};

/** What a tool call did, as the UI sees it. */
export type ToolStatus = "running" | "ok" | "error";

/** One incremental piece of a streamed reply. */
export type StreamDelta =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "reasoning"; readonly text: string }
  | {
      readonly kind: "tool";
      readonly id: string;
      readonly name: string;
      readonly status: ToolStatus;
      /** A one-line summary — the arguments while running, the result after. */
      readonly summary: string;
    };
