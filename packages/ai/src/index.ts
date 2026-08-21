// Re-exported so consumers can drop to pi-ai's full event stream (tool calls,
// usage, cost) alongside `endpointModel()` without adding a direct dependency.
export type {
  AssistantMessage,
  AssistantMessageEvent,
  Context,
  Message,
  Model,
  Usage,
} from "@earendil-works/pi-ai";
export type { ApiType } from "./apis.ts";
export { API_TYPES, apiFor, DEFAULT_API, isApiType } from "./apis.ts";
export type { ChatMessage, ChatRole, Endpoint, StreamDelta, ToolStatus } from "./chat.ts";
export { ChatApiError, describeError } from "./errors.ts";
export type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ContextEvent,
  ContextEventResult,
  EventMap,
  Extension,
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  MessageEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
  ToolCallEvent,
  ToolCallEventResult,
} from "./extension.ts";
export { BLOCKED_MESSAGE, firesEvent } from "./extension.ts";
export type { ModelSpec } from "./models.ts";
export { endpointModel, fetchModelIds, PROVIDER_ID } from "./models.ts";
export type { Infer, JsonSchema } from "./schema.ts";
export { schemaProblems } from "./schema.ts";
export { listModels, streamChat } from "./streamChat.ts";
export type {
  ToolCall,
  ToolContent,
  ToolDefinition,
  ToolExecuteContext,
  ToolResult,
  ToolSpec,
  ToolUpdate,
} from "./tools.ts";
export { defineTool, toolOutput, toolText } from "./tools.ts";
