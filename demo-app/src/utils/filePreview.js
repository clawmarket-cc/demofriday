const SPREADSHEET_EXTENSIONS = new Set(['xls', 'xlsx'])
const PDF_EXTENSIONS = new Set(['pdf'])
const WORD_EXTENSIONS = new Set(['doc', 'docx'])
const PRESENTATION_EXTENSIONS = new Set(['ppt', 'pptx'])
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown'])
const DOCX_EXTENSIONS = new Set(['docx'])
const PPTX_EXTENSIONS = new Set(['pptx'])
const MARKDOWN_TYPES = new Set(['text/markdown', 'text/x-markdown'])
const DOCX_TYPES = new Set(['application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
const PPTX_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

export const getFileExtension = (filename = '') => {
  const lastDot = filename.lastIndexOf('.')

  if (lastDot === -1) {
    return ''
  }

  return filename.slice(lastDot + 1).toLowerCase()
}

export const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export const getAttachmentLabel = (filename = '') => {
  const extension = getFileExtension(filename)

  if (!extension) {
    return 'FILE'
  }

  return extension.toUpperCase().slice(0, 4)
}

export const getPreviewKind = (file) => {
  const extension = getFileExtension(file?.name ?? '')
  const type = (file?.type ?? '').toLowerCase()

  if (type === 'application/pdf' || PDF_EXTENSIONS.has(extension)) {
    return 'pdf'
  }

  if (MARKDOWN_TYPES.has(type) || MARKDOWN_EXTENSIONS.has(extension)) {
    return 'markdown'
  }

  if (
    type === 'application/vnd.ms-excel'
    || type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    || SPREADSHEET_EXTENSIONS.has(extension)
  ) {
    return 'spreadsheet'
  }

  if (
    type === 'application/msword'
    || type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    || WORD_EXTENSIONS.has(extension)
  ) {
    return 'document'
  }

  if (
    type === 'application/vnd.ms-powerpoint'
    || type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    || PRESENTATION_EXTENSIONS.has(extension)
  ) {
    return 'presentation'
  }

  return 'file'
}

export const supportsStructuredDocumentPreview = (file) => {
  const extension = getFileExtension(file?.name ?? '')
  const type = (file?.type ?? '').toLowerCase()

  return DOCX_TYPES.has(type) || DOCX_EXTENSIONS.has(extension)
}

export const supportsStructuredPresentationPreview = (file) => {
  const extension = getFileExtension(file?.name ?? '')
  const type = (file?.type ?? '').toLowerCase()

  return PPTX_TYPES.has(type) || PPTX_EXTENSIONS.has(extension)
}

export const supportsInlinePreview = (file) => {
  const kind = getPreviewKind(file)

  return (
    kind === 'pdf'
    || kind === 'markdown'
    || kind === 'spreadsheet'
    || supportsStructuredDocumentPreview(file)
    || supportsStructuredPresentationPreview(file)
  )
}
