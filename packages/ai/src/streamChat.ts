import type {
  Api,
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Message,
  Model,
  Tool,
  ToolCall,
  Usage,
} from "@earendil-works/pi-ai";
import { type ApiType, apiFor } from "./apis.ts";
import type { ChatMessage, Endpoint, StreamDelta } from "./chat.ts";
import { ChatApiError } from "./errors.ts";
import {
  BLOCKED_MESSAGE,
  type Extension,
  type ExtensionContext,
  emitBeforeAgentStart,
  emitContext,
  emitToolCall,
  type Handlers,
  loadExtensions,
  notify,
} from "./extension.ts";
import { endpointModel, fetchModelIds, type ModelSpec } from "./models.ts";
import { type ToolDefinition, type ToolResult, type ToolUpdate, toolText } from "./tools.ts";

/** Replayed history carries no token accounting of its own. */
const NO_USAGE: Usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

const toPiMessage = (message: ChatMessage, model: Model<Api>): Message =>
  message.role === "assistant"
    ? {
        role: "assistant",
        content: [{ type: "text", text: message.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: NO_USAGE,
        stopReason: "stop",
        timestamp: Date.now(),
      }
    : { role: "user", content: message.content, timestamp: Date.now() };

/** pi-ai carries the system prompt beside the turns instead of inside them. */
const toContext = (messages: readonly ChatMessage[], model: Model<Api>): Context => {
  const system = messages.filter((message) => message.role === "system");
  return {
    ...(system.length > 0
      ? { systemPrompt: system.map((message) => message.content).join("\n\n") }
      : {}),
    messages: messages
      .filter((message) => message.role !== "system")
      .map((message) => toPiMessage(message, model)),
  };
};

/** The two pi events this facade surfaces as deltas. */
const toDelta = (event: AssistantMessageEvent): StreamDelta | undefined =>
  event.type === "thinking_delta"
    ? { kind: "reasoning", text: event.delta }
    : event.type === "text_delta"
      ? { kind: "text", text: event.delta }
      : undefined;

/** The newest user turn, which pi reports to `before_agent_start` as `prompt`. */
const lastPrompt = (messages: readonly ChatMessage[]): string =>
  messages.findLast((message) => message.role === "user")?.content ?? "";

/**
 * pi-ai types `Tool.parameters` as typebox's `TSchema`, but a typebox schema is a
 * plain JSON Schema object at runtime, so a literal is a valid value. The cast is
 * what keeps typebox out of the bundle — see "Browser notes" in the README.
 */
const toPiTool = (tool: ToolDefinition): Tool => ({
  name: tool.name,
  description: tool.description,
  parameters: tool.parameters as unknown as Tool["parameters"],
});

/** A tool's contribution to the system prompt, in pi's order: snippet, then guidelines. */
const toolPrompt = (tool: ToolDefinition): readonly string[] => [
  ...(tool.promptSnippet === undefined ? [] : [tool.promptSnippet]),
  ...(tool.promptGuidelines ?? []),
];

const toolCallsOf = (message: AssistantMessage): readonly ToolCall[] =>
  message.content.filter((part): part is ToolCall => part.type === "toolCall");

/** A compact one-liner for the UI; the full text still goes to the model. */
const summarise = (value: unknown, limit = 120): string => {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? {});
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
};

const toolResult = (call: ToolCall, output: string, isError: boolean): Message => ({
  role: "toolResult",
  toolCallId: call.id,
  toolName: call.name,
  content: [{ type: "text", text: output }],
  isError,
  timestamp: Date.now(),
});

/** Stops a model that keeps calling tools instead of answering. */
const DEFAULT_MAX_TOOL_TURNS = 10;

/**
 * Stream a chat completion from any OpenAI-compatible endpoint.
 * Yields text deltas and, when the model exposes them (`reasoning_content`,
 * `reasoning` or `reasoning_text`), reasoning deltas.
 *
 * `options.extensions` are pi-shaped extension factories; they are loaded in
 * order and their handlers fire around the request — see `Extension`.
 */
export async function* streamChat(
  endpoint: Endpoint,
  model: string,
  messages: readonly ChatMessage[],
  options: {
    signal?: AbortSignal;
    extensions?: readonly Extension[];
    /** Tools the model may call. Each call is executed here and fed back. */
    tools?: readonly ToolDefinition[];
    /** How many tool rounds before giving up. Defaults to 10. */
    maxToolTurns?: number;
    /** Per-model metadata: which api to speak, whether it reasons. */
    modelSpec?: ModelSpec;
  } = {},
): AsyncGenerator<StreamDelta> {
  const descriptor = endpointModel(endpoint, model, options.modelSpec ?? {});
  // Resolved per request, and only the implementation this endpoint speaks: each
  // sits behind its own dynamic import, so nothing else is ever downloaded.
  const api = await apiFor(descriptor.api as ApiType);
  const handlers = await loadExtensions(options.extensions ?? []);
  const ctx: ExtensionContext = { model: descriptor, signal: options.signal };
  const tools = options.tools ?? [];
  const maxTurns = options.maxToolTurns ?? DEFAULT_MAX_TOOL_TURNS;

  const base = toContext(messages, descriptor);
  // pi folds each active tool's prompt snippet and guidelines into the system
  // prompt before firing `before_agent_start`, so an extension sees the prompt
  // the model will actually get.
  const assembled = [base.systemPrompt ?? "", ...tools.flatMap(toolPrompt)]
    .filter((part) => part !== "")
    .join("\n\n");
  // Fired once per request, as in pi — not once per tool round.
  const systemPrompt = await emitBeforeAgentStart(handlers, lastPrompt(messages), assembled, ctx);

  let turns = base.messages;

  for (let round = 0; round < maxTurns; round++) {
    const context: Context = {
      ...(systemPrompt === "" ? {} : { systemPrompt }),
      // pi emits `context` before every LLM call, so each round sees it.
      messages: await emitContext(handlers, turns, ctx),
      ...(tools.length > 0 ? { tools: tools.map(toPiTool) } : {}),
    };

    // The API implementation is called directly: an endpoint here carries its own
    // key, so pi-ai's provider registry and auth resolution would add nothing but
    // weight.
    const events = api.stream(descriptor, context, {
      apiKey: endpoint.apiKey,
      ...(options.signal ? { signal: options.signal } : {}),
    });

    let reply: AssistantMessage | undefined;

    for await (const event of events) {
      // pi-ai ends a failed request with an event rather than a rejection; this
      // package keeps failures throwable so callers can use try/catch. pi has no
      // extension event for a failed request, so none is fired here.
      if (event.type === "error")
        throw new ChatApiError(event.error.errorMessage ?? `Request ${event.reason}`);
      if (event.type === "start")
        await notify(
          handlers.message_start,
          { type: "message_start", message: event.partial },
          ctx,
        );
      else if (event.type === "done") {
        reply = event.message;
        await notify(handlers.message_end, { type: "message_end", message: event.message }, ctx);
      } else
        await notify(
          handlers.message_update,
          { type: "message_update", message: event.partial, assistantMessageEvent: event },
          ctx,
        );

      const delta = toDelta(event);
      if (delta !== undefined) yield delta;
    }

    const calls = reply === undefined ? [] : toolCallsOf(reply);
    // No tool calls means the model answered, which ends the request.
    if (reply === undefined || calls.length === 0) return;

    const results: Message[] = [];
    let terminate = calls.length > 0;

    for (const call of calls) {
      yield {
        kind: "tool",
        id: call.id,
        name: call.name,
        status: "running",
        summary: summarise(call.arguments),
      };

      const tool = tools.find((candidate) => candidate.name === call.name);
      // Progress arrives synchronously from inside `execute`, which cannot
      // yield from this generator — so updates are queued and drained after.
      const updates: string[] = [];
      const onUpdate = (update: ToolUpdate) => updates.push(summarise(toolText(update)));

      // A tool the model invented, or one that threw, comes back as an error
      // result rather than a thrown request: the model gets to correct itself.
      const [output, failed, result] = await run(
        tool,
        call,
        options.signal,
        onUpdate,
        ctx,
        handlers,
      );

      for (const summary of updates)
        yield { kind: "tool", id: call.id, name: call.name, status: "running", summary };

      // pi stops only when the whole batch asks to; one tool cannot end the turn
      // on the others' behalf.
      if (failed || result?.terminate !== true) terminate = false;

      results.push(toolResult(call, output, failed));
      yield {
        kind: "tool",
        id: call.id,
        name: call.name,
        status: failed ? "error" : "ok",
        summary: summarise(output),
      };
    }

    turns = [...turns, reply, ...results];
    if (terminate) return;
  }

  throw new ChatApiError(`Gave up after ${maxTurns} tool rounds without a final answer`);
}

/** Executes one call, converting any failure into an error result. */
const run = async (
  tool: ToolDefinition | undefined,
  call: ToolCall,
  signal: AbortSignal | undefined,
  onUpdate: (update: ToolUpdate) => void,
  ctx: ExtensionContext,
  handlers: Handlers,
): Promise<[output: string, failed: boolean, result: ToolResult | undefined]> => {
  if (tool === undefined) return [`No such tool: ${call.name}`, true, undefined];
  try {
    // pi lets a tool repair arguments before it sees them; a throw here is a
    // tool error like any other.
    const params = tool.prepareArguments?.(call.arguments) ?? call.arguments;

    // pi fires `tool_call` between argument preparation and execution, which is
    // where a permission gate belongs: the arguments are final, and nothing has
    // run yet. Handlers may patch `params` in place, so `event.input` is the
    // same object that reaches `execute`.
    const blocked = await emitToolCall(
      handlers,
      { type: "tool_call", toolCallId: call.id, toolName: call.name, input: params },
      ctx,
    );
    // pi re-checks the signal after the hook and *before* honouring a block,
    // which is the right order: a handler that asks the user is the natural
    // place for them to give up, and giving up must fail the stream rather than
    // report a refusal and burn another round trip.
    if (signal?.aborted === true) throw signal.reason;
    // A block is an error result, not a failed request: the model reads the
    // reason and can ask for something else instead of the turn dying.
    if (blocked?.block === true) return [blocked.reason ?? BLOCKED_MESSAGE, true, undefined];

    const result = await tool.execute(call.id, params, signal, onUpdate, ctx);
    return [toolText(result), false, result];
  } catch (error) {
    // An aborted request must fail the stream rather than be reported to the
    // model as a tool that went wrong.
    if (signal?.aborted === true) throw error;
    return [error instanceof Error ? error.message : String(error), true, undefined];
  }
};

/** List model ids from the endpoint's `/models` route, sorted alphabetically. */
export const listModels = async (endpoint: Endpoint): Promise<readonly string[]> =>
  (await fetchModelIds(endpoint)).toSorted();
