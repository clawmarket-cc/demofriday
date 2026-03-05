const DEFAULT_API_BASE_URL = 'https://api.golemforce.ai'
const DEFAULT_POLL_INTERVAL_MS = 1500

const trimTrailingSlashes = (value) => value.replace(/\/+$/, '')
const isFormData = (value) => typeof FormData !== 'undefined' && value instanceof FormData

const stripFinalEnvelope = (value) => {
  if (typeof value !== 'string') {
    return ''
  }

  const trimmed = value.trim()
  const wrapped = trimmed.match(/^<final>([\s\S]*)<\/final>$/i)

  if (wrapped) {
    return wrapped[1].trim()
  }

  return trimmed
}

export const apiBaseUrl = trimTrailingSlashes(
  import.meta.env.VITE_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL,
)

const buildUrl = (path, params = {}) => {
  const search = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') {
      return
    }

    search.set(key, String(value))
  })

  const suffix = search.toString()
  return `${apiBaseUrl}${path}${suffix ? `?${suffix}` : ''}`
}

const readJson = async (response) => {
  const raw = await response.text()

  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('Backend returned invalid JSON.')
  }
}

const requestJson = async (path, options = {}, params = {}) => {
  const headers = new Headers(options.headers ?? {})

  if (!isFormData(options.body) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  const response = await fetch(buildUrl(path, params), {
    ...options,
    headers,
  })

  const payload = await readJson(response)

  if (!response.ok) {
    const message =
      typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error
        : `Request failed (${response.status})`

    throw new Error(message)
  }

  return payload
}

export const fetchAgentLanes = async () => requestJson('/agents')

export const fetchChat = async ({ agent, agentId, conversationId, limit = 80 }) =>
  requestJson('/chat', {}, { agent: agent ?? agentId, conversationId, limit })

const resolveDownloadUrl = (downloadUrl, fileId) => {
  if (typeof downloadUrl === 'string' && downloadUrl.trim()) {
    if (/^https?:\/\//i.test(downloadUrl)) {
      return downloadUrl
    }

    if (downloadUrl.startsWith('/')) {
      return `${apiBaseUrl}${downloadUrl}`
    }

    return `${apiBaseUrl}/${downloadUrl.replace(/^\/+/, '')}`
  }

  if (fileId) {
    return buildUrl(`/files/${fileId}`)
  }

  return ''
}

const normalizeFileRecord = (file, fallbackName = 'Generated file') => {
  if (!file || typeof file !== 'object') {
    return null
  }

  const id = file.id ?? file.fileId ?? file._id ?? ''
  const name =
    file.name ?? file.fileName ?? file.filename ?? file.originalName ?? file.originalFilename ?? fallbackName
  const size = Number(file.size ?? file.bytes ?? file.byteSize ?? 0)
  const type = file.type ?? file.mimeType ?? file.mimetype ?? ''

  return {
    id,
    name,
    size: Number.isFinite(size) ? size : 0,
    type,
    downloadUrl: resolveDownloadUrl(file.downloadUrl ?? file.url ?? file.href, id),
  }
}

const normalizeFileRecords = (files, fallbackName) => {
  if (!Array.isArray(files)) {
    return []
  }

  return files.map((file) => normalizeFileRecord(file, fallbackName)).filter(Boolean)
}

export const uploadFiles = async ({ agent, conversationId, files }) => {
  const formData = new FormData()
  const selectedFiles = Array.isArray(files) ? files.filter(Boolean) : [files].filter(Boolean)

  if (agent) {
    formData.append('agent', agent)
  }

  if (conversationId) {
    formData.append('conversationId', conversationId)
  }

  selectedFiles.forEach((file) => {
    formData.append('files', file)
  })

  const payload = await requestJson('/files', {
    method: 'POST',
    body: formData,
  })

  return {
    ...payload,
    uploaded: normalizeFileRecords(payload?.uploaded, 'Uploaded file'),
  }
}

export const postChat = async ({
  agent,
  conversationId,
  message,
  fileIds = [],
  thinking,
  timeoutMs,
}) =>
  requestJson('/chat', {
    method: 'POST',
    body: JSON.stringify({
      agent,
      conversationId,
      message,
      fileIds,
      ...(thinking ? { thinking } : {}),
      ...(timeoutMs ? { timeoutMs } : {}),
    }),
  })

const messageContentToText = (content) => {
  if (typeof content === 'string') {
    return stripFinalEnvelope(content)
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item
        if (typeof item?.text === 'string') return item.text
        if (typeof item?.content === 'string') return item.content
        return ''
      })
      .join('\n')
      .trim()
      .replace(/^<final>/i, '')
      .replace(/<\/final>$/i, '')
      .trim()
  }

  if (content && typeof content === 'object') {
    if (typeof content.text === 'string') return stripFinalEnvelope(content.text)
    if (typeof content.content === 'string') return stripFinalEnvelope(content.content)
  }

  return ''
}

const messageToText = (message) => {
  if (!message || typeof message !== 'object') {
    return ''
  }

  if (typeof message.text === 'string') {
    return stripFinalEnvelope(message.text)
  }

  if (typeof message.message === 'string') {
    return stripFinalEnvelope(message.message)
  }

  return messageContentToText(message.content)
}

export const normalizeBackendMessages = (payload) => {
  if (!Array.isArray(payload?.messages)) {
    return []
  }

  return payload.messages
    .map((message) => ({
      role: message?.role,
      text: messageToText(message),
      timestamp:
        message?.timestamp ??
        message?.createdAt ??
        message?.created_at ??
        message?.time ??
        null,
    }))
    .filter((message) => (message.role === 'user' || message.role === 'assistant') && message.text)
}

export const countAssistantMessages = (payload) =>
  normalizeBackendMessages(payload).filter((message) => message.role === 'assistant').length

export const extractAssistantText = (payload, previousAssistantCount = 0) => {
  const normalized = normalizeBackendMessages(payload)
  const assistants = normalized.filter((message) => message.role === 'assistant')

  if (assistants.length > previousAssistantCount) {
    return assistants[assistants.length - 1].text
  }

  const directAssistantText = messageContentToText(payload?.assistant)

  if (directAssistantText) {
    return directAssistantText
  }

  return ''
}

export const extractArtifacts = (payload) =>
  normalizeFileRecords(payload?.files?.artifacts, 'Generated file')

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export const pollForAssistantReply = async ({
  agent,
  agentId,
  conversationId,
  previousAssistantCount,
  timeoutMs = 60000,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
}) => {
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    await delay(pollIntervalMs)
    const payload = await fetchChat({ agent: agent ?? agentId, conversationId, limit: 200 })
    const assistantText = extractAssistantText(payload, previousAssistantCount)

    if (assistantText) {
      return assistantText
    }
  }

  return ''
}
