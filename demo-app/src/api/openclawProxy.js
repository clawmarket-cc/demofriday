const DEFAULT_API_BASE_URL = 'https://api.golemforce.ai'
const DEFAULT_POLL_INTERVAL_MS = 1500

const trimTrailingSlashes = (value) => value.replace(/\/+$/, '')
const isFormData = (value) => typeof FormData !== 'undefined' && value instanceof FormData

const stripInvalidJsonControlChars = (value) => {
  let sanitized = ''

  for (const char of value) {
    const code = char.charCodeAt(0)

    if (code >= 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) {
      sanitized += char
    }
  }

  return sanitized
}

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

const stripUiFileContextBlock = (value) => {
  if (typeof value !== 'string') {
    return ''
  }

  return value
    .replace(/\[UI_FILE_CONTEXT\][\s\S]*?\[\/UI_FILE_CONTEXT\]/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
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
    try {
      const sanitizedRaw = stripInvalidJsonControlChars(raw)
      return JSON.parse(sanitizedRaw)
    } catch {
      throw new Error('Backend returned invalid JSON.')
    }
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

export const clearChat = async ({ agent, agentId, conversationId }) =>
  requestJson(
    '/chat',
    {
      method: 'DELETE',
    },
    { agent: agent ?? agentId, conversationId },
  )

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
  const size = Number(file.size ?? file.sizeBytes ?? file.bytes ?? file.byteSize ?? file.contentLength ?? 0)
  const type = file.type ?? file.mimeType ?? file.mimetype ?? file.contentType ?? ''

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

const dedupeFiles = (files = []) => {
  const seen = new Set()

  return files.filter((file) => {
    const key = file.id || file.downloadUrl || `${file.name}-${file.size}-${file.type}`

    if (seen.has(key)) {
      return false
    }

    seen.add(key)
    return true
  })
}

const normalizeMessageFileBundle = (message) => {
  if (!message || typeof message !== 'object') {
    return {
      file: null,
      artifacts: [],
    }
  }

  const files = []
  const pushSingle = (value, fallbackName = 'Attachment') => {
    const normalized = normalizeFileRecord(value, fallbackName)

    if (normalized) {
      files.push(normalized)
    }
  }
  const pushMany = (value, fallbackName = 'Attachment') => {
    files.push(...normalizeFileRecords(value, fallbackName))
  }

  pushSingle(message.file, 'Attachment')
  pushSingle(message.attachment, 'Attachment')
  pushMany(message.attachments, 'Attachment')
  pushMany(message.artifacts, 'Generated file')
  pushMany(message.generatedFiles, 'Generated file')

  if (Array.isArray(message.files)) {
    pushMany(message.files, 'Attachment')
  } else if (message.files && typeof message.files === 'object') {
    pushSingle(message.files.file ?? message.files.attachment, 'Attachment')
    pushMany(message.files.attachments, 'Attachment')
    pushMany(message.files.artifacts, 'Generated file')
    pushMany(message.files.generated, 'Generated file')
    pushMany(message.files.generatedFiles, 'Generated file')
  }

  const normalizedFiles = dedupeFiles(files)

  return {
    file: normalizedFiles[0] ?? null,
    artifacts: normalizedFiles.slice(1),
  }
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
  clientMessageCount,
  clientLastAssistantText,
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
      ...(Number.isFinite(clientMessageCount) ? { clientMessageCount } : {}),
      ...(typeof clientLastAssistantText === 'string' && clientLastAssistantText.trim()
        ? { clientLastAssistantText }
        : {}),
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
    return stripUiFileContextBlock(stripFinalEnvelope(message.text))
  }

  if (typeof message.message === 'string') {
    return stripUiFileContextBlock(stripFinalEnvelope(message.message))
  }

  return stripUiFileContextBlock(messageContentToText(message.content))
}

export const normalizeBackendMessages = (payload) => {
  if (!Array.isArray(payload?.messages)) {
    return []
  }

  return payload.messages
    .map((message) => {
      const normalizedFiles = normalizeMessageFileBundle(message)

      return {
        role: message?.role,
        text: messageToText(message),
        timestamp:
          message?.timestamp ??
          message?.createdAt ??
          message?.created_at ??
          message?.time ??
          null,
        file: normalizedFiles.file,
        artifacts: normalizedFiles.artifacts,
      }
    })
    .filter(
      (message) =>
        (message.role === 'user' || message.role === 'assistant')
        && (message.text || message.file || message.artifacts.length > 0),
    )
}

export const countAssistantMessages = (payload) =>
  normalizeBackendMessages(payload).filter((message) => message.role === 'assistant').length

export const extractAssistantText = (payload, previousAssistantCount = 0) => {
  const normalized = normalizeBackendMessages(payload)
  const assistants = normalized.filter((message) => message.role === 'assistant')

  if (assistants.length > previousAssistantCount) {
    const newestTextMessage = assistants
      .slice(previousAssistantCount)
      .reverse()
      .find((message) => message.text)

    if (newestTextMessage) {
      return newestTextMessage.text
    }
  }

  const directAssistantText = messageContentToText(payload?.assistant)

  if (directAssistantText) {
    return directAssistantText
  }

  return ''
}

const extractEmbeddedAssistantFiles = (payload) =>
  dedupeFiles(
    normalizeBackendMessages(payload)
      .filter((message) => message.role === 'assistant')
      .flatMap((message) => [message.file, ...(message.artifacts ?? [])].filter(Boolean)),
  )

export const extractArtifacts = (payload) =>
  dedupeFiles([
    ...normalizeFileRecords(payload?.files?.artifacts, 'Generated file'),
    ...extractEmbeddedAssistantFiles(payload),
  ])

export const extractNewArtifacts = (payload) => {
  const newArtifacts = normalizeFileRecords(payload?.files?.newArtifacts, 'Generated file')
  if (newArtifacts.length > 0) {
    return dedupeFiles([...newArtifacts, ...extractEmbeddedAssistantFiles(payload)])
  }

  return extractArtifacts(payload)
}

export const extractRunStatus = (payload) => {
  if (payload?.runStatus && typeof payload.runStatus === 'object') {
    return payload.runStatus
  }

  return {
    state: payload?.pending ? 'running' : 'idle',
    pending: Boolean(payload?.pending),
    label: payload?.pending ? 'Running' : 'Idle',
    startedAt: null,
    updatedAt: null,
    runId: payload?.run?.runId ?? null,
    error: null,
    artifactCount: extractArtifacts(payload).length,
    hasUploads: Array.isArray(payload?.files?.requested) && payload.files.requested.length > 0,
  }
}

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
    const payload = await fetchChat({ agent: agent ?? agentId, conversationId, limit: 200 })
    const assistantText = extractAssistantText(payload, previousAssistantCount)

    if (assistantText) {
      return assistantText
    }

    await delay(pollIntervalMs)
  }

  return ''
}

export const pollForChatCompletion = async ({
  agent,
  agentId,
  conversationId,
  previousAssistantCount,
  timeoutMs = 60000,
  pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
  completionGracePolls = 2,
  onUpdate,
}) => {
  const deadline = Date.now() + timeoutMs
  let lastPayload = null
  let remainingCompletionGracePolls = Math.max(0, completionGracePolls)

  while (Date.now() < deadline) {
    const payload = await fetchChat({ agent: agent ?? agentId, conversationId, limit: 200 })
    lastPayload = payload
    onUpdate?.(payload)

    const assistantText = extractAssistantText(payload, previousAssistantCount)
    const runStatus = extractRunStatus(payload)
    const artifacts = extractNewArtifacts(payload)

    if (runStatus.state === 'error') {
      throw new Error(runStatus.error || 'The backend run failed.')
    }

    if (runStatus.pending === false) {
      if (assistantText || artifacts.length > 0 || remainingCompletionGracePolls === 0) {
        return payload
      }

      remainingCompletionGracePolls -= 1
      await delay(pollIntervalMs)
      continue
    }

    await delay(pollIntervalMs)
  }

  return lastPayload
}
