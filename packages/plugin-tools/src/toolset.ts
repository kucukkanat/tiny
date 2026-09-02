import type { ToolSet } from 'ai'
import { useMemo } from 'react'
import { compile } from './compile'
import { isToolName, useTools } from './tool'

/**
 * The tools the model gets. One that is off, unnamed or broken is left out
 * rather than taking the working ones down with it.
 *
 * Memoised because chat builds its agent from this: a fresh object every render
 * would be a fresh agent, and a fresh connection, every render.
 */
export const useToolSet = (): ToolSet => {
  const tools = useTools()

  return useMemo(
    () =>
      Object.fromEntries(
        tools.flatMap((one) => {
          if (!one.enabled || !isToolName(one.name)) return []
          const built = compile(one.source)
          return built.ok ? [[one.name, built.tool] as const] : []
        }),
      ),
    [tools],
  )
}
