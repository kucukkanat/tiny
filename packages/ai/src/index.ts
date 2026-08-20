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
export { listModels, streamChat } from "./client.ts";
export { endpointModel, fetchModelIds, PROVIDER_ID } from "./endpoint.ts";
export type {
  BeforeAgentStartEvent,
  BeforeAgentStartEventResult,
  ContextEvent,
  ContextEventResult,
  Extension,
  ExtensionAPI,
  ExtensionContext,
  ExtensionHandler,
  MessageEndEvent,
  MessageStartEvent,
  MessageUpdateEvent,
} from "./extension.ts";
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
