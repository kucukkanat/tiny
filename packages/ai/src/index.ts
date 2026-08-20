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
export { listModels, streamChat } from "./client.ts";
export type { ModelSpec } from "./endpoint.ts";
export { endpointModel, fetchModelIds, PROVIDER_ID } from "./endpoint.ts";
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
export type {
  ChatMessage,
  ChatRole,
  Endpoint,
  StreamDelta,
  ToolContent,
  ToolDefinition,
  ToolExecuteContext,
  ToolResult,
  ToolStatus,
  ToolUpdate,
} from "./types.ts";
export { ChatApiError, describeError, toolOutput, toolText } from "./types.ts";
