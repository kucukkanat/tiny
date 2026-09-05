/**
 * `localStorage` is finite and every quota error in this app used to land
 * inside a render or an effect, where a throw empties the React root — a white
 * screen instead of a message. Failure is a value here so the caller can say so.
 */
export const write = (key: string, value: string): boolean => {
  try {
    localStorage.setItem(key, value)
    return true
  } catch {
    return false
  }
}

/** What a provider will accept as a tool name, and what the model will call. */
export const isToolName = (name: string) => /^[a-zA-Z0-9_-]{1,64}$/.test(name)

/** What an extension may call itself: one lowercase path segment. */
export const isExtensionId = (id: string) => /^[a-z0-9][a-z0-9-]{0,31}$/.test(id)
