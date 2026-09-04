// What an extension needs from the SDK, and no more: `tool` for the inference
// that makes `execute` know its own input, and `generateText` for a screen that
// wants to ask the model something itself. Naming them keeps the rest of the SDK
// droppable — `export *` here costs 30 kB gzipped on every first paint.
export { asSchema, dynamicTool, generateText, jsonSchema, tool } from 'ai'
export type { LanguageModel, ModelMessage, Tool, ToolSet, UIMessage } from 'ai'
