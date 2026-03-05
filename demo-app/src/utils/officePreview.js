import { strFromU8, unzipSync } from 'fflate'

const DOCX_DOCUMENT_PATH = 'word/document.xml'
const PPTX_SLIDE_PATH_PATTERN = /^ppt\/slides\/slide(\d+)\.xml$/

const DOCX_PARAGRAPH_PATTERN = /<w:p\b[\s\S]*?<\/w:p>/g
const DOCX_PARAGRAPH_STYLE_PATTERN = /<w:pStyle\b[^>]*(?:w:val|val)="([^"]+)"/
const DOCX_TEXT_PATTERN = /<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g

const PPTX_SHAPE_PATTERN = /<p:sp\b[\s\S]*?<\/p:sp>/g
const PPTX_PARAGRAPH_PATTERN = /<a:p\b[\s\S]*?<\/a:p>/g
const PPTX_TEXT_PATTERN = /<a:t\b[^>]*>([\s\S]*?)<\/a:t>/g
const PPTX_TITLE_PLACEHOLDER_PATTERN = /<p:ph\b[^>]*type="(title|ctrTitle|subTitle)"/

const INLINE_BREAK_PATTERN = /<(?:w:br|a:br)\b[^>]*\/>/g
const TAB_PATTERN = /<w:tab\b[^>]*\/>/g
const XML_ENTITY_PATTERN = /&(amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi

const XML_ENTITY_MAP = {
  amp: '&',
  apos: "'",
  gt: '>',
  lt: '<',
  quot: '"',
}

const decodeXmlEntities = (value = '') =>
  value.replace(XML_ENTITY_PATTERN, (entity, token) => {
    const normalizedToken = token.toLowerCase()

    if (normalizedToken in XML_ENTITY_MAP) {
      return XML_ENTITY_MAP[normalizedToken]
    }

    if (normalizedToken.startsWith('#x')) {
      return String.fromCodePoint(Number.parseInt(normalizedToken.slice(2), 16))
    }

    if (normalizedToken.startsWith('#')) {
      return String.fromCodePoint(Number.parseInt(normalizedToken.slice(1), 10))
    }

    return entity
  })

const normalizeText = (value = '') =>
  value
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

const getArchive = (arrayBuffer) =>
  unzipSync(arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer))

const getArchiveText = (archive, path) => {
  const entry = archive[path]

  if (!entry) {
    return ''
  }

  return strFromU8(entry)
}

const extractParagraphText = (xml = '', textPattern) => {
  const normalizedXml = xml
    .replace(INLINE_BREAK_PATTERN, '\n')
    .replace(TAB_PATTERN, '\t')
    .replace(textPattern, (_, text) => decodeXmlEntities(text))
    .replace(/<[^>]+>/g, '')

  return normalizeText(normalizedXml)
}

const countWords = (value = '') => value.match(/[^\s]+/g)?.length ?? 0

const getHeadingLevel = (style = '') => {
  const headingMatch = style.match(/heading(\d+)/i)

  if (headingMatch) {
    return Number.parseInt(headingMatch[1], 10)
  }

  if (/title|subtitle/i.test(style)) {
    return 1
  }

  return 0
}

export const parseDocumentPreview = (arrayBuffer) => {
  const archive = getArchive(arrayBuffer)
  const documentXml = getArchiveText(archive, DOCX_DOCUMENT_PATH)

  if (!documentXml) {
    return {
      blocks: [],
      paragraphCount: 0,
      wordCount: 0,
    }
  }

  const blocks = Array.from(documentXml.matchAll(DOCX_PARAGRAPH_PATTERN))
    .map((match, index) => {
      const paragraphXml = match[0]
      const text = extractParagraphText(paragraphXml, DOCX_TEXT_PATTERN)

      if (!text) {
        return null
      }

      const styleMatch = paragraphXml.match(DOCX_PARAGRAPH_STYLE_PATTERN)
      const headingLevel = getHeadingLevel(styleMatch?.[1] ?? '')

      return {
        id: `doc-block-${index + 1}`,
        kind: headingLevel > 0 ? 'heading' : 'paragraph',
        level: headingLevel,
        text,
      }
    })
    .filter(Boolean)

  const combinedText = blocks.map((block) => block.text).join(' ')

  return {
    blocks,
    paragraphCount: blocks.length,
    wordCount: countWords(combinedText),
  }
}

export const parsePresentationPreview = (arrayBuffer) => {
  const archive = getArchive(arrayBuffer)
  const slideEntries = Object.keys(archive)
    .map((path) => {
      const match = path.match(PPTX_SLIDE_PATH_PATTERN)

      if (!match) {
        return null
      }

      return {
        path,
        index: Number.parseInt(match[1], 10),
      }
    })
    .filter(Boolean)
    .sort((left, right) => left.index - right.index)

  const slides = slideEntries
    .map(({ path, index }) => {
      const slideXml = getArchiveText(archive, path)
      const shapes = slideXml.match(PPTX_SHAPE_PATTERN) ?? []

      let title = ''
      const blocks = []

      shapes.forEach((shapeXml) => {
        const paragraphs = Array.from(shapeXml.matchAll(PPTX_PARAGRAPH_PATTERN))
          .map((match) => extractParagraphText(match[0], PPTX_TEXT_PATTERN))
          .filter(Boolean)

        if (paragraphs.length === 0) {
          return
        }

        if (!title && PPTX_TITLE_PLACEHOLDER_PATTERN.test(shapeXml)) {
          title = paragraphs.join(' ')
          return
        }

        blocks.push(...paragraphs)
      })

      if (!title && blocks.length > 0) {
        title = blocks.shift()
      }

      if (!title && blocks.length === 0) {
        return null
      }

      return {
        id: `slide-${index}`,
        index,
        title,
        blocks,
      }
    })
    .filter(Boolean)

  return {
    slides,
  }
}
