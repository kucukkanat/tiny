/**
 * What the New button starts you with, and the closest thing to documentation
 * this plugin has: the three shapes a tool comes in — reach the network, work
 * something out locally, or ask the person at the keyboard.
 *
 * They avoid template literals on purpose. A backtick inside a tool is fine, but
 * one inside a tool inside this file is two levels of escaping to read past.
 */
export const TEMPLATES = [
  {
    label: 'HTTP',
    source: `tool({
  description: 'Current weather in a city.',
  inputSchema: z.object({
    city: z.string().describe('City name, e.g. Istanbul'),
  }),
  execute: async ({ city }, { abortSignal }) => {
    const url = 'https://wttr.in/' + encodeURIComponent(city) + '?format=j1'
    const response = await fetch(url, { signal: abortSignal })
    if (!response.ok) throw new Error('wttr.in said ' + response.status)
    const now = (await response.json()).current_condition[0]
    // Hand back what answers the question. The whole payload is 40kB of noise.
    return { celsius: now.temp_C, description: now.weatherDesc[0].value }
  },
})`,
  },
  {
    label: 'Script',
    source: `tool({
  description: 'The time right now, anywhere.',
  inputSchema: z.object({
    timeZone: z.string().optional().describe('IANA zone, e.g. Europe/Istanbul'),
  }),
  execute: ({ timeZone }) => ({
    now: new Date().toLocaleString('en-GB', { timeZone: timeZone || undefined }),
    zone: timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone,
  }),
})`,
  },
  {
    label: 'Ask',
    source: `tool({
  description: 'Ask the person at the keyboard something only they know.',
  inputSchema: z.object({
    question: z.string().describe('What to ask, in one sentence'),
  }),
  // ask() puts the question in the chat and waits for the answer. A second
  // argument offers choices; you can always type something else instead.
  execute: ({ question }) => ask(question, ['Yes', 'No']),
})`,
  },
] as const
