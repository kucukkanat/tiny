/**
 * Unique enough to name a tool or a question, and available outside a secure
 * context — `crypto.randomUUID` is not, which bites the moment you open the dev
 * server on a phone over plain http.
 */
export const newId = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
