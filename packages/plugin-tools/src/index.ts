import type { Plugin } from '@tiny/plugin-host'
import { ToolsScreen } from './screen'

export const tools: Plugin = {
  id: 'tools',
  title: 'Tools',
  Screen: ToolsScreen,
}

// What chat needs to put these in front of the model, and the question an
// extension's tool asks with. The rest stays internal.
export { askUser } from './ask'
export { ToolQuestions } from './questions'
export { useToolSet } from './toolset'
