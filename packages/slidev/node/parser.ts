import { promises as fs } from 'fs'
import matter from 'gray-matter'
import YAML from 'js-yaml'
import { ParseOptions, SlideInfo, SlidevConfig, SlidevMarkdown } from '@slidev/types'

export async function load(
  filepath: string,
  options?: ParseOptions,
) {
  const markdown = await fs.readFile(filepath, 'utf-8')

  return parse(markdown, filepath, options)
}

export async function save(data: SlidevMarkdown, filepath?: string) {
  filepath = filepath || data.filepath!

  await fs.writeFile(filepath, stringify(data), 'utf-8')
}

export function stringify(data: SlidevMarkdown) {
  return `${
    data.slides
      .map(stringifySlide)
      .join('\n')
      .trim()
  }\n`
}

export function filterDisabled(data: SlidevMarkdown) {
  data.slides = data.slides.filter(i => !i.frontmatter?.disabled)
  return data
}

function stringifySlide(data: SlideInfo, idx = 1) {
  if (!data.raw)
    prettifySlide(data)

  return (data.raw.startsWith('---') || idx === 0)
    ? data.raw
    : `---\n${data.raw.startsWith('\n') ? data.raw : `\n${data.raw}`}`
}

function prettifySlide(data: SlideInfo) {
  data.content = `\n${data.content.trim()}\n`
  data.raw = Object.keys(data.frontmatter || {}).length
    ? `---\n${YAML.safeDump(data.frontmatter).trim()}\n---\n${data.content}`
    : data.content
  if (data.note)
    data.raw += `\n<!--\n${data.note.trim()}\n-->\n`
  else
    data.raw += '\n'
  return data
}

export function prettify(data: SlidevMarkdown) {
  data.slides.forEach(prettifySlide)
  return data
}

export function parse(
  markdown: string,
  filepath?: string,
  options: ParseOptions = {},
): SlidevMarkdown {
  const lines = markdown.split(/\n/g)
  const slides: SlideInfo[] = []

  function parseContent(raw: string) {
    const result = matter(raw)
    let note: string | undefined
    const content = result.content
      .trim()
      .replace(/<!--([\s\S]*)-->$/g, (_, v = '') => {
        note = v.trim()
        return ''
      })
    return {
      raw,
      content,
      frontmatter: result.data || {},
      note,
    }
  }

  let start = 0

  function slice(end: number) {
    if (start === end)
      return
    const raw = lines.slice(start, end).join('\n')
    slides.push({
      start,
      end,
      ...parseContent(raw),
    })
    start = end + 1
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trimRight()
    if (line.match(/^---+$/)) {
      slice(i)

      const next = lines[i + 1]
      // found frontmatter, skip next dash
      if (line.length === 3 && !next?.match(/^\s*$/)) {
        start = i
        for (i += 1; i < lines.length; i++) {
          if (lines[i].trimRight().match(/^---$/))
            break
        }
      }
    }
  }

  if (start !== lines.length - 1)
    slice(lines.length - 1)

  const headmatter = slides?.[0].frontmatter || {}
  const config: SlidevConfig = Object.assign({}, headmatter.config || {})

  config.theme ??= headmatter.theme ?? 'default'
  config.title ??= headmatter.title ?? (slides[0].content.match(/^# (.*)$/m)?.[1] || '').trim()
  config.remoteAssets ??= headmatter.remoteAssets ?? true
  config.monaco ??= headmatter.monaco ?? 'dev-only'

  return {
    raw: markdown,
    filepath,
    slides,
    options,
    config,
  }
}
