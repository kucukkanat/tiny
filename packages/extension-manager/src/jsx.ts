/**
 * JSX -> React automatic runtime, by hand.
 *
 * A scanner, not a parser: it copies JavaScript through verbatim and only
 * understands the JSX it meets. What it must get right to do that is the set of
 * places a `<` is not a comparison and a `/` is not a division — which means
 * knowing where strings, templates, comments and regex literals begin and end.
 */

type Used = { jsx: boolean; jsxs: boolean; Fragment: boolean }

const KEYWORDS_BEFORE_VALUE = new Set([
  'return',
  'typeof',
  'instanceof',
  'in',
  'of',
  'new',
  'delete',
  'void',
  'throw',
  'case',
  'do',
  'else',
  'yield',
  'await',
])

/**
 * Every HTML entity, without shipping the table: a textarea's content is
 * RCDATA, so the parser decodes `&mdash;` but leaves whitespace and `<` alone.
 * `DOMParser` looks like the same trick and isn't — parsing into a body applies
 * HTML whitespace rules and eats the leading space of ` a &amp; b`.
 */
const box = /* @__PURE__ */ (() =>
  typeof document === 'undefined' ? undefined : document.createElement('textarea'))()

const decode = (text: string): string => {
  if (!text.includes('&') || !box) return text
  box.innerHTML = text
  return box.value
}

/** Babel's JSXText rule: trim each line, drop blank ones, join with a space. */
const cleanText = (raw: string): string => {
  const lines = raw.split(/\r\n|\n|\r/)
  let last = 0
  lines.forEach((line, i) => {
    if (/[^ \t]/.test(line)) last = i
  })
  let out = ''
  lines.forEach((line, i) => {
    let s = line.replace(/\t/g, ' ')
    if (i !== 0) s = s.replace(/^ +/, '')
    if (i !== lines.length - 1) s = s.replace(/ +$/, '')
    if (s) out += i === last ? s : s + ' '
  })
  return out
}

export const transformJsx = (source: string): string => {
  const used: Used = { jsx: false, jsxs: false, Fragment: false }
  let i = 0

  const at = (n = 0) => source[i + n] ?? ''
  const fail: (why: string) => never = (why) => {
    const before = source.slice(0, i)
    const line = before.split('\n').length
    throw new SyntaxError(`${why} (${line}:${i - before.lastIndexOf('\n')})`)
  }

  /** The last significant character, which decides `<` and `/`. */
  let prev = ''
  let prevWord = ''

  const startsValue = () =>
    prev === '' ||
    // `>` is here for the arrow in `() => <div/>`. `<` is deliberately not:
    // it would read the second `<` of `1 << 2` as an opening tag.
    '([{,;:=>+-*/%&|^!?~'.includes(prev) ||
    (prev === 'w' && KEYWORDS_BEFORE_VALUE.has(prevWord)) ||
    prev === '}'

  /** Copy one string, template, comment or regex; returns false if none here. */
  const skipAtom = (emit: (text: string) => void): boolean => {
    const c = at()
    if (c === '/' && at(1) === '/') {
      const end = source.indexOf('\n', i)
      emit(source.slice(i, end === -1 ? source.length : end))
      i = end === -1 ? source.length : end
      return true
    }
    if (c === '/' && at(1) === '*') {
      const end = source.indexOf('*/', i + 2)
      if (end === -1) fail('unterminated comment')
      emit(source.slice(i, end + 2))
      i = end + 2
      return true
    }
    if (c === '"' || c === "'") {
      const start = i++
      while (i < source.length && at() !== c) i += at() === '\\' ? 2 : 1
      if (i >= source.length) fail('unterminated string')
      i++
      emit(source.slice(start, i))
      prev = 'w'
      prevWord = ''
      return true
    }
    if (c === '`') {
      i++
      emit('`')
      return template(emit)
    }
    if (c === '/' && startsValue()) {
      const start = i++
      let inClass = false
      for (;;) {
        if (i >= source.length || at() === '\n') fail('unterminated regex')
        if (at() === '\\') i += 2
        else if (at() === '[') {
          inClass = true
          i++
        } else if (at() === ']') {
          inClass = false
          i++
        } else if (at() === '/' && !inClass) {
          i++
          break
        } else i++
      }
      while (/[a-z]/.test(at())) i++
      emit(source.slice(start, i))
      prev = 'w'
      prevWord = ''
      return true
    }
    return false
  }

  /** Copy a template literal from just after its backtick, JSX in `${}` and all. */
  const template = (emit: (text: string) => void): boolean => {
    const start = i
    for (;;) {
      if (i >= source.length) fail('unterminated template')
      if (at() === '\\') i += 2
      else if (at() === '`') break
      else if (at() === '$' && at(1) === '{') {
        emit(source.slice(start, i) + '${')
        i += 2
        scanCode('}', emit)
        i++
        emit('}')
        return template(emit)
      } else i++
    }
    emit(source.slice(start, ++i))
    prev = 'w'
    prevWord = ''
    return true
  }

  /** Copy JavaScript until `stop` at depth zero, turning any JSX into calls. */
  function scanCode(stop: '' | '}' | ')', emit: (text: string) => void) {
    let depth = 0
    while (i < source.length) {
      const c = at()
      if (depth === 0 && stop && c === stop) return
      if (skipAtom(emit)) continue
      if (c === '<' && startsValue()) {
        const from = i
        const made = parseElement()
        emit(made)
        // An element collapses onto one line, so put the rest back: whatever
        // the source spent minus whatever the expression already carries.
        const count = (text: string) => (text.match(/\n/g) ?? []).length
        emit('\n'.repeat(Math.max(0, count(source.slice(from, i)) - count(made))))
        prev = 'w'
        prevWord = ''
        continue
      }
      if ('([{'.includes(c)) depth++
      else if (')]}'.includes(c)) depth--
      if (/[A-Za-z0-9_$]/.test(c)) {
        const start = i
        while (/[A-Za-z0-9_$]/.test(at())) i++
        prevWord = source.slice(start, i)
        prev = 'w'
        emit(prevWord)
        continue
      }
      if (!/\s/.test(c)) {
        prev = c
        prevWord = ''
      }
      emit(c)
      i++
    }
  }

  const skipSpace = () => {
    for (;;) {
      while (/\s/.test(at())) i++
      if (at() === '/' && at(1) === '/') i = source.indexOf('\n', i) + 1 || source.length
      else if (at() === '/' && at(1) === '*') i = source.indexOf('*/', i) + 2
      else return
    }
  }

  // Unicode, because `<Ünicode/>` is legal JSX. The two joiners are identifier
  // characters in several scripts, which is why they are in the class — the
  // lint rule reads them as the start of an emoji sequence, which they are not.
  // oxlint-disable-next-line no-misleading-character-class
  const NAME = /[\p{ID_Start}_$][\p{ID_Continue}$\u{200C}\u{200D}-]*/uy

  const readName = (): string => {
    NAME.lastIndex = i
    const m = NAME.exec(source)
    if (!m) fail('expected a name')
    i = NAME.lastIndex
    return m[0]
  }

  /** `{ … }` at `i`, balanced, JSX inside handled. Returns the inner source. */
  const readBraced = (): string => {
    i++ // {
    // A new expression starts here, whatever came before the brace. Carrying
    // `prev` in would read `{<b/>}` after `{c}` as a comparison.
    const [wasPrev, wasWord] = [prev, prevWord]
    prev = '{'
    prevWord = ''
    let inner = ''
    scanCode('}', (text) => {
      inner += text
    })
    if (at() !== '}') fail('unterminated {')
    i++
    prev = wasPrev
    prevWord = wasWord
    return inner
  }

  const parseElement = (): string => {
    i++ // <
    skipSpace()

    // Fragment
    if (at() === '>') {
      i++
      used.Fragment = true
      const kids = parseChildren('')
      return call('_Fragment', [], kids, undefined)
    }

    let name = readName()
    while (at() === '.' || at() === ':') {
      name += at() + (i++, readName())
    }
    // A lowercase first letter means a DOM tag; anything else is in scope.
    const type = /^[a-z][a-z0-9-]*$/.test(name) ? JSON.stringify(name) : name

    const props: string[] = []
    let key: string | undefined
    for (;;) {
      skipSpace()
      if (at() === '/' && at(1) === '>') {
        i += 2
        return call(type, props, [], key)
      }
      if (at() === '>') {
        i++
        const kids = parseChildren(name)
        return call(type, props, kids, key)
      }
      if (at() === '{') {
        const inner = readBraced().trim()
        if (!inner.startsWith('...')) fail('only {...spread} is an attribute')
        props.push(`...${inner.slice(3)}`)
        continue
      }
      // `xmlns:xlink`, `xlink:href` — a namespace is part of the name.
      let attr = readName()
      if (at() === ':') attr += ':' + (i++, readName())
      skipSpace()
      let value = 'true'
      if (at() === '=') {
        i++
        skipSpace()
        if (at() === '{') value = readBraced()
        else if (at() === '"' || at() === "'") {
          const q = at()
          const start = ++i
          while (i < source.length && at() !== q) i++
          value = JSON.stringify(decode(source.slice(start, i)))
          i++
        } else if (at() === '<') value = parseElement()
        else fail('attribute value must be a string, {expression} or element')
      }
      if (attr === 'key') key = value
      else props.push(`${JSON.stringify(attr)}: ${value}`)
    }
  }

  const parseChildren = (name: string): string[] => {
    const kids: string[] = []
    for (;;) {
      const start = i
      while (i < source.length && at() !== '<' && at() !== '{') i++
      if (i > start) {
        const text = cleanText(decode(source.slice(start, i)))
        if (text) kids.push(JSON.stringify(text))
      }
      if (i >= source.length) fail(`unclosed <${name}>`)
      if (at() === '{') {
        const inner = readBraced()
        const bare = inner.replace(/\/\*[^]*?\*\//g, '').trim()
        if (bare) kids.push(bare)
        continue
      }
      if (at(1) === '/') {
        i += 2
        skipSpace()
        if (at() !== '>') {
          readName()
          while (at() === '.' || at() === ':') {
            i++
            readName()
          }
        }
        skipSpace()
        if (at() !== '>') fail('expected >')
        i++
        return kids
      }
      kids.push(parseElement())
    }
  }

  const call = (
    type: string,
    props: string[],
    kids: string[],
    key: string | undefined,
  ): string => {
    const many = kids.length > 1
    const all = [...props]
    if (kids.length === 1) all.push(`children: ${kids[0]}`)
    else if (many) all.push(`children: [${kids.join(', ')}]`)
    if (many) used.jsxs = true
    else used.jsx = true
    const fn = many ? '_jsxs' : '_jsx'
    const obj = `{${all.join(', ')}}`
    return key === undefined ? `${fn}(${type}, ${obj})` : `${fn}(${type}, ${obj}, ${key})`
  }

  let out = ''
  scanCode('', (text) => {
    out += text
  })

  const names = [
    used.jsx && 'jsx as _jsx',
    used.jsxs && 'jsxs as _jsxs',
    used.Fragment && 'Fragment as _Fragment',
  ].filter(Boolean)
  return names.length
    ? `import { ${names.join(', ')} } from "react/jsx-runtime";\n${out}`
    : out
}
