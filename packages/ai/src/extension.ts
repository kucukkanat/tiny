import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  Message,
  Model,
} from "@earendil-works/pi-ai";

/** A pi-shaped extension factory: receives an `ExtensionAPI` and subscribes to lifecycle events. */
export type Extension = (tiny: ExtensionAPI) => void | Promise<void>;

/** pi's `ExtensionHandler` signature, kept verbatim so handlers port between hosts unchanged. */
export type ExtensionHandler<E, R = undefined> = (
  event: E,
  ctx: ExtensionContext,
  // biome-ignore lint/suspicious/noConfusingVoidType: pi's signature, kept verbatim
) => Promise<R | void> | R | void;

/** Fired once before the request. Handlers can replace the system prompt. */
export type BeforeAgentStartEvent = {
  readonly type: "before_agent_start";
  readonly prompt: string;
  /** Already chained through earlier extensions. */
  readonly systemPrompt: string;
};
export type BeforeAgentStartEventResult = { readonly systemPrompt?: string };

/** Fired before the LLM call. `messages` is a copy, safe to modify. */
export type ContextEvent = {
  readonly type: "context";
  readonly messages: Message[];
};
export type ContextEventResult = { readonly messages?: Message[] };

/** Fired when the assistant message starts streaming. */
export type MessageStartEvent = {
  readonly type: "message_start";
  readonly message: AssistantMessage;
};

/** Fired for each streamed update, carrying pi's raw token-level event. */
export type MessageUpdateEvent = {
  readonly type: "message_update";
  readonly message: AssistantMessage;
  readonly assistantMessageEvent: AssistantMessageEvent;
};

/** Fired once the assistant message is complete; carries usage and cost. */
export type MessageEndEvent = {
  readonly type: "message_end";
  readonly message: AssistantMessage;
};

/** Fired before a tool executes; can block. No re-validation happens after handlers run. */
export type ToolCallEvent = {
  readonly type: "tool_call";
  readonly toolCallId: string;
  readonly toolName: string;
  /** Mutable, as in pi. Patch arguments here rather than in the return value. */
  input: Record<string, unknown>;
};

export type ToolCallEventResult = {
  /** Block execution. To modify arguments, mutate `event.input` instead. */
  readonly block?: boolean;
  /** Shown to the model in place of the result. */
  readonly reason?: string;
};

/** pi's wording when a handler blocks without saying why. */
export const BLOCKED_MESSAGE = "Tool execution was blocked";

/** The reduced context handlers receive: only the model and the request's signal. */
export type ExtensionContext = {
  readonly model: Model<Api>;
  readonly signal: AbortSignal | undefined;
};

/** Every event this package fires, with the payload and result of each. */
export type EventMap = {
  before_agent_start: [BeforeAgentStartEvent, BeforeAgentStartEventResult];
  context: [ContextEvent, ContextEventResult];
  message_start: [MessageStartEvent, undefined];
  message_update: [MessageUpdateEvent, undefined];
  message_end: [MessageEndEvent, undefined];
  tool_call: [ToolCallEvent, ToolCallEventResult];
};

export interface ExtensionAPI {
  on<K extends keyof EventMap>(
    event: K,
    handler: ExtensionHandler<EventMap[K][0], EventMap[K][1]>,
  ): void;
}

export type Handlers = {
  [K in keyof EventMap]: ExtensionHandler<EventMap[K][0], EventMap[K][1]>[];
};

const emptyHandlers = (): Handlers => ({
  before_agent_start: [],
  context: [],
  message_start: [],
  message_update: [],
  message_end: [],
  tool_call: [],
});

/** Whether this package fires `event`; read off `Handlers` so it cannot drift from what is emitted. */
const FIRED = emptyHandlers();
export const firesEvent = (event: string): boolean => Object.hasOwn(FIRED, event);

/** Run each factory to collect its subscriptions; factories may be async, as in pi. */
export const loadExtensions = async (extensions: readonly Extension[]): Promise<Handlers> => {
  const handlers = emptyHandlers();
  const tiny: ExtensionAPI = {
    on: (event, handler) => {
      // Widening to unknown[] lets the generic key index the record.
      const registered: unknown[] = handlers[event];
      registered.push(handler);
    },
  };
  for (const extension of extensions) await extension(tiny);
  return handlers;
};

/** Notify every observer of an event whose result is ignored. */
export const notify = async <E extends { readonly type: string }>(
  registered: readonly ExtensionHandler<E>[],
  event: E,
  ctx: ExtensionContext,
): Promise<void> => {
  for (const handler of registered) await handler(event, ctx);
};

/** Chain the system prompt through every handler, each seeing the previous result, as pi does. */
export const emitBeforeAgentStart = async (
  handlers: Handlers,
  prompt: string,
  systemPrompt: string,
  ctx: ExtensionContext,
): Promise<string> => {
  let current = systemPrompt;
  for (const handler of handlers.before_agent_start) {
    const result = await handler(
      { type: "before_agent_start", prompt, systemPrompt: current },
      ctx,
    );
    if (result?.systemPrompt !== undefined) current = result.systemPrompt;
  }
  return current;
};

/** Fold the messages through every `context` handler, in registration order. */
export const emitContext = async (
  handlers: Handlers,
  messages: Message[],
  ctx: ExtensionContext,
): Promise<Message[]> => {
  let current = messages;
  for (const handler of handlers.context) {
    const result = await handler({ type: "context", messages: [...current] }, ctx);
    if (result?.messages !== undefined) current = result.messages;
  }
  return current;
};

/** Run `tool_call` handlers in registration order until one blocks; each sees `event.input`
 * as earlier handlers left it. A throwing handler propagates, as in pi. */
export const emitToolCall = async (
  handlers: Handlers,
  event: ToolCallEvent,
  ctx: ExtensionContext,
): Promise<ToolCallEventResult | undefined> => {
  let result: ToolCallEventResult | undefined;
  for (const handler of handlers.tool_call) {
    const returned = await handler(event, ctx);
    if (returned === undefined) continue;
    result = returned;
    if (result.block === true) return result;
  }
  return result;
};
