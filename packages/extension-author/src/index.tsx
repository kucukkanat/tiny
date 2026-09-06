import type { Extension } from '@tiny/host'
import { tools } from './tools'

/**
 * The verbs the Extensions screen has, handed to the model — list, read, write,
 * delete — and not the one it hasn't. A written extension lands as a row that is
 * off, exactly as an install link does, so code the app did not give you still
 * never starts running without a press.
 *
 * Its own package rather than four more exports on the manager, because the
 * manager is the one extension that cannot be switched off. These five would
 * then be in context on every turn of every conversation, forever.
 */
export default (): Extension => ({
  id: 'author',
  title: 'Author',

  // On every turn, so: what exists, the two things that are always got wrong,
  // and where the rest is. Everything else is behind `extension_docs`.
  instructions:
    'You can write extensions for this app yourself, with `write_extension`. Read `extension_docs` before the first one — the source is plain JavaScript with JSX, never TypeScript, and may import only `react`, `react/jsx-runtime`, `react-router`, `zod` and `ai`. What you write is saved switched off; say so, and leave turning it on to the person you are talking to.',

  tools,
})
