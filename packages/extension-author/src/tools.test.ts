import { newInstall, readInstalled, saveInstalled, subscribeInstalled } from '@tiny/host'
import { beforeEach, expect, test } from 'bun:test'
import type { Tool } from 'ai'
import author from './index'

// The list is cached for as long as something is watching it, and the app
// always is. Nothing here mounts, so `localStorage` being cleared between tests
// would otherwise leave the last test's rows in memory.
beforeEach(() => subscribeInstalled(() => undefined)())

// Nothing in these tools reads it, and every field the SDK fills is one of them.
const CALL = { toolCallId: 'c1', messages: [], context: undefined }

const TOOLS = author().tools ?? {}

// Every one of the five has an `execute`; a missing one should fail here loudly.
const run = async (name: string, input: unknown): Promise<unknown> => {
  const { execute } = TOOLS[name] as Required<Pick<Tool, 'execute'>>
  return await execute(input, CALL)
}

const wrote = (source: string, extra: object = {}) =>
  run('write_extension', { source, ...extra }) as Promise<{
    id: string
    title: string
    enabled: boolean
    created: boolean
  }>

const MODULE = "export default () => ({ id: 'x', title: 'Reverse' })"

test('what is written lands switched off, and reads back', async () => {
  const { id, title, enabled, created } = await wrote(MODULE)

  expect([enabled, created, title]).toEqual([false, true, 'Reverse'])
  expect(await run('extensions', {})).toEqual([
    { id, title: 'Reverse', enabled: false, bytes: MODULE.length },
  ])
  expect(await run('read_extension', { id })).toEqual({
    title: 'Reverse',
    source: MODULE,
  })
})

// The name has two writers and they take turns; this is the one that reads it
// off the text, so a row is named before it has ever run.
test('the title comes out of the source, and an explicit one still wins', async () => {
  expect((await wrote('export default () => ({ id: 1 })')).title).toBe('Pasted')
  expect((await wrote(MODULE, { title: 'Mine' })).title).toBe('Mine')
})

test('writing again bumps the version and leaves the switch where it was', async () => {
  const { id } = await wrote(MODULE)
  const [row] = readInstalled()
  if (row) saveInstalled({ ...row, enabled: true })

  const again = await wrote("export default () => ({ id: 'x', title: 'Reverse' }) //", {
    id,
  })
  const saved = readInstalled().find((one) => one.id === id)

  expect([again.enabled, again.created]).toEqual([true, false])
  // Bumped because the browser has already seen text at this address; without
  // it, turning the row off and on again would re-run the old blob.
  expect([saved?.version, saved?.source?.endsWith('//')]).toEqual([2, true])
})

// The whole reason it compiles here rather than on Run: an error the model can
// act on in the same turn, instead of a broken row nobody notices.
test('source that does not compile is refused, with the position', () => {
  expect(wrote('export default () => <div>')).rejects.toThrow(/unclosed <div> \(1:\d+\)/)
})

test('nothing is stored when the source is refused', async () => {
  await wrote('export default () => <div>').catch(() => undefined)
  expect(readInstalled()).toEqual([])
})

// A row carrying both an address and a body is a shape the store drops on the
// next read, so it would vanish rather than fail.
test('one installed from a URL is not written over', async () => {
  const one = newInstall('https://example.com/thing.js')
  saveInstalled(one)

  expect(wrote(MODULE, { id: one.id })).rejects.toThrow(/installed from a URL/)
  expect(await run('read_extension', { id: one.id })).toEqual({
    title: 'thing.js',
    url: 'https://example.com/thing.js',
  })
})

test('deleting says what went, and it is gone', async () => {
  const { id } = await wrote(MODULE)

  expect(await run('delete_extension', { id })).toEqual({ deleted: 'Reverse' })
  expect(readInstalled()).toEqual([])
})

test.each(['read_extension', 'delete_extension'])(
  '%s names an id it cannot find',
  (name) => {
    expect(run(name, { id: 'nope' })).rejects.toThrow(
      'There is no extension with the id "nope".',
    )
  },
)
