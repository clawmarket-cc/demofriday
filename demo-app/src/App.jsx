import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
import FilePreviewPanel from './components/FilePreviewPanel'
import {
  agentDefinitions,
  buildAgents,
  getAssistantMessageText,
  languageCodes,
  languageOrder,
  localeByLanguage,
  translations,
} from './i18n'
import {
  clearChat,
  extractAssistantText,
  extractNewArtifacts,
  extractRunStatus,
  fetchChat,
  normalizeBackendMessages,
  pollForChatCompletion,
  postChat,
  uploadFiles,
} from './api/openclawProxy'
import {
  appendMissingConversationMessages,
  buildMessageExactSignature,
  buildMessageLooseSignature,
} from './utils/messageMerge'

const STORAGE_CLIENT_ID_KEY = 'golemforce-chat-client-id'
const STORAGE_CONVERSATION_IDS_KEY = 'golemforce-chat-conversation-ids'
const STORAGE_RUN_STATUS_KEY = 'golemforce-chat-run-status'
const STORAGE_RUNTIME_CONVERSATIONS_KEY = 'golemforce-chat-runtime-conversations'
const RUNTIME_CONVERSATIONS_CACHE_KEY = '__golemforce-chat-runtime-conversations'
const DEFAULT_THREAD_ID = 'main'

const DEFAULT_FILE_PROMPT = 'Please analyze the uploaded file.'
const DEFAULT_BACKEND_ERROR =
  'I could not reach the model backend. Please retry. If this keeps failing, check /health on the proxy.'
const DEFAULT_EMPTY_ASSISTANT_RESPONSE = 'The backend completed without returning assistant text.'
const DEFAULT_FILE_READY_RESPONSE = 'Your generated file is ready.'
const DEFAULT_UPLOAD_ERROR = 'Upload completed without returning a file id.'
const DEFAULT_PROCESSING_REQUEST_STATUS = 'Processing request'
const DEFAULT_GENERATING_WORD_STATUS = 'Generating Word document'
const DEFAULT_GENERATING_PDF_STATUS = 'Generating PDF'
const DEFAULT_PREPARING_SPREADSHEET_STATUS = 'Preparing spreadsheet'
const DEFAULT_BUILDING_PRESENTATION_STATUS = 'Building presentation'
const CHAT_REQUEST_TIMEOUT_MS = 3000
const DIRECT_CHAT_RESPONSE_WAIT_MS = 250
const POLL_TIMEOUT_MS = 120000

const GENERIC_PENDING_STATUS_HINTS = new Set([
  'queued',
  'queueing',
  'running',
  'working',
  'processing',
  'waiting for agent output',
  'still processing',
  'preparing response',
])

const normalizeStatusLabel = (label) =>
  typeof label === 'string' ? label.trim().toLowerCase() : ''

const hasWordTaskHint = (content) => /\b(word|docx?|document)\b/.test(content)
const hasPdfTaskHint = (content) => /\b(pdf)\b/.test(content)
const hasSpreadsheetTaskHint = (content) =>
  /\b(excel|spreadsheet|workbook|sheet|xlsx?|csv|table)\b/.test(content)
const hasPresentationTaskHint = (content) =>
  /\b(powerpoint|pptx?|presentation|slides?|deck)\b/.test(content)

const inferPendingTaskLabel = (chatCopy, text, file) => {
  const textContent = typeof text === 'string' ? text.toLowerCase() : ''
  const fileName = (file?.name ?? '').toLowerCase()
  const combined = `${textContent} ${fileName}`.trim()

  if (!combined) {
    return chatCopy.runningStatus || DEFAULT_PROCESSING_REQUEST_STATUS
  }

  if (hasWordTaskHint(combined)) {
    return chatCopy.generatingWordStatus || DEFAULT_GENERATING_WORD_STATUS
  }

  if (hasPdfTaskHint(combined)) {
    return chatCopy.generatingPdfStatus || DEFAULT_GENERATING_PDF_STATUS
  }

  if (hasPresentationTaskHint(combined)) {
    return chatCopy.buildingPresentationStatus || DEFAULT_BUILDING_PRESENTATION_STATUS
  }

  if (hasSpreadsheetTaskHint(combined)) {
    return chatCopy.preparingSpreadsheetStatus || DEFAULT_PREPARING_SPREADSHEET_STATUS
  }

  return chatCopy.runningStatus || DEFAULT_PROCESSING_REQUEST_STATUS
}

const isGenericPendingStatusLabel = (chatCopy, label) => {
  const normalizedLabel = normalizeStatusLabel(label)

  if (!normalizedLabel) {
    return true
  }

  const localizedGenericLabels = [
    chatCopy.runningStatus,
    chatCopy.uploadingStatus,
    chatCopy.dispatchingStatus,
  ]
    .map((value) => normalizeStatusLabel(value))
    .filter(Boolean)

  if (localizedGenericLabels.includes(normalizedLabel)) {
    return true
  }

  return GENERIC_PENDING_STATUS_HINTS.has(normalizedLabel)
}

const shouldRetainPendingRunStatus = (previousRunStatus, nextRunStatus, payload) => {
  if (!previousRunStatus?.pending) {
    return false
  }

  if (!nextRunStatus || nextRunStatus.pending) {
    return false
  }

  if (nextRunStatus.state === 'completed' || nextRunStatus.state === 'error') {
    return false
  }

  const startedAtMs = Date.parse(previousRunStatus.startedAt || '')

  if (Number.isFinite(startedAtMs) && Date.now() - startedAtMs > 20000) {
    return false
  }

  const hasMessages = normalizeBackendMessages(payload).length > 0
  const hasArtifacts = extractNewArtifacts(payload).length > 0

  return !hasMessages && !hasArtifacts
}

const haveSameConversationMessages = (currentMessages = [], nextMessages = []) => {
  if (currentMessages.length !== nextMessages.length) {
    return false
  }

  return currentMessages.every(
    (message, index) =>
      buildMessageExactSignature(message) === buildMessageExactSignature(nextMessages[index]),
  )
}

const payloadHasAssistantText = (payload, previousAssistantCount = 0) =>
  Boolean(extractAssistantText(payload, previousAssistantCount))
  || normalizeBackendMessages(payload).some(
    (message) => message.role === 'assistant' && typeof message.text === 'string' && message.text.trim(),
  )

const createEmptyConversations = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, []]))

const readRuntimeConversations = () => {
  if (typeof window === 'undefined') {
    return null
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_RUNTIME_CONVERSATIONS_KEY)

    if (raw) {
      const parsed = JSON.parse(raw)

      if (parsed && typeof parsed === 'object') {
        return parsed
      }
    }
  } catch {
    // Ignore sessionStorage failures and fall back to in-memory cache.
  }

  const cached = window[RUNTIME_CONVERSATIONS_CACHE_KEY]

  if (!cached || typeof cached !== 'object') {
    return null
  }

  return cached
}

const persistRuntimeConversations = (conversations) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(
      STORAGE_RUNTIME_CONVERSATIONS_KEY,
      JSON.stringify(conversations),
    )
  } catch {
    // Ignore sessionStorage persistence failures and keep the in-memory cache.
  }

  window[RUNTIME_CONVERSATIONS_CACHE_KEY] = conversations
}

const createInitialConversations = () => {
  const initial = createEmptyConversations()
  const cached = readRuntimeConversations()

  if (!cached) {
    return initial
  }

  agentDefinitions.forEach((agent) => {
    if (Array.isArray(cached[agent.id])) {
      initial[agent.id] = cached[agent.id]
    }
  })

  return initial
}

const createInitialSendingState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, false]))

const createInitialClearingState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, false]))

const createInitialPreviewState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, null]))

const readStorageValue = (key) => {
  if (typeof window === 'undefined') {
    return null
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      const value = storage?.getItem(key)

      if (typeof value === 'string' && value.length > 0) {
        return value
      }
    } catch {
      // Ignore individual storage failures and fall back to the next store.
    }
  }

  return null
}

const writeStorageValue = (key, value) => {
  if (typeof window === 'undefined') {
    return
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage?.setItem(key, value)
    } catch {
      // Ignore storage write failures and keep the in-memory state.
    }
  }
}

const readStoredJson = (key, fallback) => {
  const raw = readStorageValue(key)

  if (!raw) {
    return fallback
  }

  try {
    const parsed = JSON.parse(raw)
    return parsed ?? fallback
  } catch {
    return fallback
  }
}

const clearStorageValue = (key) => {
  if (typeof window === 'undefined') {
    return
  }

  for (const storage of [window.localStorage, window.sessionStorage]) {
    try {
      storage?.removeItem(key)
    } catch {
      // Ignore storage cleanup failures and continue.
    }
  }
}

const clearStoredRunStatusState = () => {
  clearStorageValue(STORAGE_RUN_STATUS_KEY)
}

const persistRunStatusState = (runStatusByAgent) => {
  writeStorageValue(STORAGE_RUN_STATUS_KEY, JSON.stringify(runStatusByAgent))
}

const createInitialRunStatusState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, null]))

const resolveMessageText = (language, message) => {
  if (message.role !== 'assistant') {
    return message.text
  }

  if (message.kind) {
    return getAssistantMessageText(language, message)
  }

  return message.text
}

const createClientId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const getClientId = () => {
  if (typeof window === 'undefined') {
    return `local:${DEFAULT_THREAD_ID}`
  }

  try {
    const existing = readStorageValue(STORAGE_CLIENT_ID_KEY)
    const clientId = existing || createClientId()

    if (!existing) {
      writeStorageValue(STORAGE_CLIENT_ID_KEY, clientId)
    }

    return `${clientId}:${DEFAULT_THREAD_ID}`
  } catch {
    return `volatile-${createClientId()}`
  }
}

const buildConversationId = (agentId, clientId = getClientId()) => {
  const agentSegment =
    typeof agentId === 'string' && agentId.trim() ? agentId.trim() : DEFAULT_THREAD_ID

  return `${clientId}:${agentSegment}:${createClientId()}`
}

const readStoredConversationIds = () => {
  const parsed = readStoredJson(STORAGE_CONVERSATION_IDS_KEY, {})
  return parsed && typeof parsed === 'object' ? parsed : {}
}

const persistConversationIds = (conversationIds) => {
  writeStorageValue(STORAGE_CONVERSATION_IDS_KEY, JSON.stringify(conversationIds))
}

const createInitialConversationIds = () => {
  const clientId = getClientId()
  const storedConversationIds = readStoredConversationIds()
  const conversationIds = Object.fromEntries(
    agentDefinitions.map((agent) => {
      const storedConversationId =
        typeof storedConversationIds[agent.id] === 'string'
          ? storedConversationIds[agent.id].trim()
          : ''

      return [agent.id, storedConversationId || buildConversationId(agent.id, clientId)]
    }),
  )

  persistConversationIds(conversationIds)

  return conversationIds
}

const rotateConversationId = (conversationIds, agentId) => {
  const nextConversationIds = {
    ...conversationIds,
    [agentId]: buildConversationId(agentId),
  }

  persistConversationIds(nextConversationIds)

  return nextConversationIds
}

const toUiFile = (file) => {
  if (!file) {
    return null
  }

  const size = Number(file.size ?? file.sizeBytes ?? file.bytes ?? file.byteSize ?? 0)

  return {
    id: file.id ?? file.fileId ?? null,
    name: file.name ?? file.fileName ?? file.filename ?? 'Attachment',
    size: Number.isFinite(size) ? size : 0,
    type: file.type ?? file.mimeType ?? '',
    downloadUrl: file.downloadUrl ?? '',
  }
}

const getUiFileSignature = (file) =>
  file?.id || file?.downloadUrl || `${file?.name ?? ''}-${file?.size ?? ''}-${file?.type ?? ''}`

const toUiArtifacts = (artifacts = []) => {
  const seen = new Set()
  const normalizedArtifacts = []

  artifacts.forEach((artifact) => {
    const normalizedArtifact = toUiFile(artifact)

    if (!normalizedArtifact) {
      return
    }

    const dedupeKey = getUiFileSignature(normalizedArtifact)

    if (seen.has(dedupeKey)) {
      return
    }

    seen.add(dedupeKey)
    normalizedArtifacts.push(normalizedArtifact)
  })

  return normalizedArtifacts
}

const buildBackendMessage = (text, hasFile) => {
  const trimmed = text?.trim() ?? ''

  if (!hasFile) {
    return trimmed
  }

  if (trimmed) {
    return trimmed
  }

  return DEFAULT_FILE_PROMPT
}

const getLastAssistantMessageText = (messages) => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'assistant' && messages[index].text) {
      return messages[index].text
    }
  }

  return ''
}

const toUiMessage = ({ agentId, role, text, file = null, artifacts = [], timestamp, id }) => ({
  id: id ?? `${agentId}-${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  role,
  agentId,
  text,
  file: toUiFile(file),
  artifacts: toUiArtifacts(Array.isArray(artifacts) ? artifacts : []),
  timestamp: timestamp ?? new Date().toISOString(),
})

const attachArtifactsToLatestAssistant = (messages, artifacts) => {
  if (!Array.isArray(artifacts) || artifacts.length === 0) {
    return messages
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return null
  }

  const lastIndex = messages.length - 1
  const lastMessage = messages[lastIndex]

  if (lastMessage?.role !== 'assistant') {
    return null
  }

  const nextMessages = [...messages]
  const fileSignature = getUiFileSignature(lastMessage?.file)
  nextMessages[lastIndex] = {
    ...lastMessage,
    artifacts: toUiArtifacts([...(lastMessage?.artifacts ?? []), ...artifacts]).filter(
      (artifact) => getUiFileSignature(artifact) !== fileSignature,
    ),
  }

  return nextMessages
}

const attachUploadedFileToUserMessage = (messages, messageId, uploadedFile) =>
  messages.map((message) =>
    message.id === messageId
      ? {
          ...message,
          file: toUiFile(uploadedFile),
        }
      : message,
  )

const getMessageRichnessScore = (message) =>
  (message?.file ? 3 : 0)
  + (Array.isArray(message?.artifacts) ? message.artifacts.length * 2 : 0)
  + (message?.text?.trim() ? 1 : 0)
  + (message?.timestamp ? 1 : 0)

const mergeDuplicateMessages = (currentMessage, nextMessage) => {
  const preferredMessage =
    getMessageRichnessScore(nextMessage) >= getMessageRichnessScore(currentMessage)
      ? nextMessage
      : currentMessage
  const fallbackMessage = preferredMessage === nextMessage ? currentMessage : nextMessage

  return {
    ...fallbackMessage,
    ...preferredMessage,
    text: preferredMessage?.text || fallbackMessage?.text || '',
    file: preferredMessage?.file || fallbackMessage?.file || null,
    artifacts: toUiArtifacts([
      ...(fallbackMessage?.artifacts ?? []),
      ...(preferredMessage?.artifacts ?? []),
    ]),
    timestamp: preferredMessage?.timestamp || fallbackMessage?.timestamp || null,
    id: preferredMessage?.id || fallbackMessage?.id,
  }
}

const collapseAdjacentDuplicateMessages = (messages = []) => {
  if (!Array.isArray(messages) || messages.length < 2) {
    return Array.isArray(messages) ? messages : []
  }

  return messages.reduce((accumulator, message) => {
    const previousMessage = accumulator[accumulator.length - 1]

    if (
      previousMessage
      && buildMessageLooseSignature(previousMessage) === buildMessageLooseSignature(message)
    ) {
      accumulator[accumulator.length - 1] = mergeDuplicateMessages(previousMessage, message)
      return accumulator
    }

    accumulator.push(message)
    return accumulator
  }, [])
}

const mergeConversationMetadataFromFallback = (messages, fallbackMessages) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return messages
  }

  if (!Array.isArray(fallbackMessages) || fallbackMessages.length === 0) {
    return messages
  }

  let fallbackCursor = 0

  return messages.map((message) => {
    const messageText = typeof message?.text === 'string' ? message.text : ''
    let matchedIndex = -1

    for (let index = fallbackCursor; index < fallbackMessages.length; index += 1) {
      const fallbackMessage = fallbackMessages[index]

      if (fallbackMessage?.role !== message?.role) {
        continue
      }

      if ((fallbackMessage?.text ?? '') !== messageText) {
        continue
      }

      if (
        fallbackMessage?.timestamp
        && message?.timestamp
        && fallbackMessage.timestamp !== message.timestamp
      ) {
        continue
      }

      matchedIndex = index
      break
    }

    if (matchedIndex === -1) {
      for (let index = fallbackCursor; index < fallbackMessages.length; index += 1) {
        const fallbackMessage = fallbackMessages[index]

        if (fallbackMessage?.role !== message?.role) {
          continue
        }

        if ((fallbackMessage?.text ?? '') !== messageText) {
          continue
        }

        matchedIndex = index
        break
      }
    }

    if (matchedIndex === -1) {
      return message
    }

    fallbackCursor = matchedIndex + 1
    const fallbackMessage = fallbackMessages[matchedIndex]
    const merged = { ...message }

    if (!merged.file && fallbackMessage?.file) {
      merged.file = toUiFile(fallbackMessage.file)
    }

    if (
      Array.isArray(fallbackMessage?.artifacts)
      && fallbackMessage.artifacts.length > 0
    ) {
      merged.artifacts = toUiArtifacts([
        ...(Array.isArray(merged.artifacts) ? merged.artifacts : []),
        ...fallbackMessage.artifacts,
      ])
    }

    return merged
  })
}

const shouldPreferFallbackMessages = (backendMessages, fallbackMessages) => {
  if (backendMessages.length < fallbackMessages.length) {
    return true
  }

  const latestFallbackUserMessage = [...fallbackMessages]
    .reverse()
    .find((message) => message?.role === 'user')

  if (!latestFallbackUserMessage) {
    return false
  }

  const latestUserLooseSignature = buildMessageLooseSignature(latestFallbackUserMessage)

  return !backendMessages.some(
    (message) => buildMessageLooseSignature(message) === latestUserLooseSignature,
  )
}

const mergeConversationMessages = (backendMessages = [], fallbackMessages = []) => {
  if (!Array.isArray(backendMessages) || backendMessages.length === 0) {
    return Array.isArray(fallbackMessages) ? [...fallbackMessages] : []
  }

  if (!Array.isArray(fallbackMessages) || fallbackMessages.length === 0) {
    return [...backendMessages]
  }

  if (shouldPreferFallbackMessages(backendMessages, fallbackMessages)) {
    return appendMissingConversationMessages(fallbackMessages, backendMessages)
  }

  const fallbackMessagesForBackendMerge = fallbackMessages.map((message) => ({
    ...message,
    timestamp: '',
  }))

  return appendMissingConversationMessages(backendMessages, fallbackMessagesForBackendMerge)
}

const buildConversationFromPayload = (
  agentId,
  payload,
  fallbackMessages = [],
  fileOnlyText = DEFAULT_FILE_READY_RESPONSE,
) => {
  const normalizedMessages = normalizeBackendMessages(payload).map((message, index) =>
    toUiMessage({
      agentId,
      role: message.role,
      text: message.text || '',
      file: message.file,
      artifacts: message.artifacts,
      timestamp: message.timestamp,
      id: `${agentId}-${message.timestamp || 'no-ts'}-${index}`,
    }),
  )
  const messages = mergeConversationMessages(normalizedMessages, fallbackMessages)
  const mergedMessages = collapseAdjacentDuplicateMessages(
    mergeConversationMetadataFromFallback(messages, fallbackMessages),
  )
  const artifacts = extractNewArtifacts(payload)
  const withArtifacts = attachArtifactsToLatestAssistant(mergedMessages, artifacts)

  if (withArtifacts) {
    return withArtifacts
  }

  if (artifacts.length === 0) {
    return mergedMessages
  }

  if (extractRunStatus(payload).pending) {
    return mergedMessages
  }

  return [
    ...mergedMessages,
    toUiMessage({
      agentId,
      role: 'assistant',
      text: fileOnlyText,
      artifacts,
      timestamp: new Date().toISOString(),
    }),
  ]
}

export default function App() {
  const [language, setLanguage] = useState('en')
  const [activeAgentId, setActiveAgentId] = useState(agentDefinitions[0].id)
  const [conversations, setConversations] = useState(createInitialConversations)
  const [sendingByAgent, setSendingByAgent] = useState(createInitialSendingState)
  const [clearingByAgent, setClearingByAgent] = useState(createInitialClearingState)
  const [runStatusByAgent, setRunStatusByAgent] = useState(createInitialRunStatusState)
  const [conversationIdsByAgent, setConversationIdsByAgent] = useState(createInitialConversationIds)
  const [previewByAgent, setPreviewByAgent] = useState(createInitialPreviewState)

  const conversationIdsByAgentRef = useRef(conversationIdsByAgent)
  const conversationsRef = useRef(conversations)
  const taskStatusLabelByAgentRef = useRef({})
  const copy = translations[language] ?? translations.en
  const copyRef = useRef(copy)
  const getChatCopy = useCallback(() => copyRef.current?.chat ?? translations.en.chat, [])
  const updateConversationFromPayload = useCallback((agentId, payload, fileOnlyText) => {
    setConversations((prev) => {
      const currentMessages = prev[agentId] ?? []
      const nextMessages = buildConversationFromPayload(
        agentId,
        payload,
        currentMessages,
        fileOnlyText,
      )

      if (haveSameConversationMessages(currentMessages, nextMessages)) {
        return prev
      }

      return {
        ...prev,
        [agentId]: nextMessages,
      }
    })
  }, [])
  const setTaskStatusLabel = useCallback((agentId, label) => {
    if (!agentId) {
      return
    }

    if (typeof label === 'string' && label.trim()) {
      taskStatusLabelByAgentRef.current = {
        ...taskStatusLabelByAgentRef.current,
        [agentId]: label.trim(),
      }
      return
    }

    if (!(agentId in taskStatusLabelByAgentRef.current)) {
      return
    }

    const nextLabels = { ...taskStatusLabelByAgentRef.current }
    delete nextLabels[agentId]
    taskStatusLabelByAgentRef.current = nextLabels
  }, [])

  const resolvePendingRunStatus = useCallback((agentId, runStatus) => {
    if (!runStatus?.pending || !agentId) {
      return runStatus
    }

    if (runStatus.state === 'uploading' || runStatus.state === 'dispatching') {
      return runStatus
    }

    const taskLabel = taskStatusLabelByAgentRef.current[agentId]

    if (!taskLabel) {
      return runStatus
    }

    const chatCopy = getChatCopy()

    if (!isGenericPendingStatusLabel(chatCopy, runStatus.label)) {
      return runStatus
    }

    return {
      ...runStatus,
      label: taskLabel,
    }
  }, [getChatCopy])

  const extractDisplayRunStatus = useCallback(
    (agentId, payload) => resolvePendingRunStatus(agentId, extractRunStatus(payload)),
    [resolvePendingRunStatus],
  )

  useEffect(() => {
    conversationIdsByAgentRef.current = conversationIdsByAgent
  }, [conversationIdsByAgent])

  useEffect(() => {
    conversationsRef.current = conversations
  }, [conversations])

  useEffect(() => {
    copyRef.current = copy
  }, [copy])

  useEffect(() => {
    persistRuntimeConversations(conversations)
  }, [conversations])

  useEffect(() => {
    clearStoredRunStatusState()
  }, [])

  useEffect(() => {
    persistRunStatusState(runStatusByAgent)
  }, [runStatusByAgent])

  useEffect(() => {
    let isDisposed = false
    const isCurrentConversation = (agentId, nextConversationId) =>
      conversationIdsByAgentRef.current[agentId] === nextConversationId
    const getFileReadyResponse = () =>
      getChatCopy().fileReadyResponse || DEFAULT_FILE_READY_RESPONSE

    const hydrateConversations = async () => {
      try {
        const settled = await Promise.allSettled(
          agentDefinitions.map(async (agent) => {
            const nextConversationId = conversationIdsByAgentRef.current[agent.id]
            const payload = await fetchChat({
              agent: agent.backendName,
              conversationId: nextConversationId,
              limit: 80,
            })

            return [agent.id, nextConversationId, payload]
          }),
        )

        if (isDisposed) {
          return
        }

        setConversations((prev) => {
          const next = { ...prev }

          settled.forEach((result) => {
            if (result.status !== 'fulfilled') {
              return
            }

            const [agentId, nextConversationId, payload] = result.value

            if (!isCurrentConversation(agentId, nextConversationId)) {
              return
            }

            if ((prev[agentId] ?? []).length > 0) {
              return
            }

            next[agentId] = buildConversationFromPayload(
              agentId,
              payload,
              prev[agentId] ?? [],
              getFileReadyResponse(),
            )
          })

          return next
        })

        setRunStatusByAgent((prev) => {
          const next = { ...prev }

          settled.forEach((result) => {
            if (result.status !== 'fulfilled') {
              return
            }

            const [agentId, nextConversationId, payload] = result.value

            if (!isCurrentConversation(agentId, nextConversationId)) {
              return
            }

            const nextRunStatus = extractDisplayRunStatus(agentId, payload)

            next[agentId] = shouldRetainPendingRunStatus(prev[agentId], nextRunStatus, payload)
              ? {
                  ...prev[agentId],
                  updatedAt: new Date().toISOString(),
                }
              : nextRunStatus
          })

          return next
        })

        settled.forEach((result) => {
          if (result.status !== 'fulfilled') {
            return
          }

          const [agentId, nextConversationId, payload] = result.value

          if (!isCurrentConversation(agentId, nextConversationId)) {
            return
          }

          const runStatus = extractDisplayRunStatus(agentId, payload)
          const agent = agentDefinitions.find((candidate) => candidate.id === agentId)

          if (!agent || !runStatus.pending) {
            return
          }

          const normalizedMessages = normalizeBackendMessages(payload)
          const latestUserMessage = [...normalizedMessages]
            .reverse()
            .find((message) => message.role === 'user')

          if (!taskStatusLabelByAgentRef.current[agentId] && latestUserMessage?.text) {
            setTaskStatusLabel(
              agentId,
              inferPendingTaskLabel(getChatCopy(), latestUserMessage.text, null),
            )
          }

          const previousAssistantCount = normalizedMessages.filter(
            (message) => message.role === 'assistant',
          ).length
          const knownArtifactSignatures = new Set(
            normalizedMessages
              .flatMap((message) => [message.file, ...(message.artifacts ?? [])])
              .filter(Boolean)
              .map((artifact) => getUiFileSignature(artifact)),
          )

          setSendingByAgent((prev) => ({
            ...prev,
            [agentId]: true,
          }))

          void (async () => {
            try {
              const finalPayload = await pollForChatCompletion({
                agent: agent.backendName,
                conversationId: nextConversationId,
                previousAssistantCount,
                knownArtifactSignatures,
                timeoutMs: POLL_TIMEOUT_MS,
                onUpdate: (nextPayload) => {
                  if (isDisposed || !isCurrentConversation(agentId, nextConversationId)) {
                    return
                  }

                  const normalizedMessageCount = normalizeBackendMessages(nextPayload).length
                  const artifacts = extractNewArtifacts(nextPayload)
                  const nextRunStatus = extractDisplayRunStatus(agentId, nextPayload)

                  if (
                    normalizedMessageCount > 0 ||
                    (artifacts.length > 0 && nextRunStatus.pending === false)
                  ) {
                    updateConversationFromPayload(agentId, nextPayload, getFileReadyResponse())
                  }

                  setRunStatusByAgent((prev) => ({
                    ...prev,
                    [agentId]: (() => {
                      const nextRunStatus = extractDisplayRunStatus(agentId, nextPayload)

                      if (shouldRetainPendingRunStatus(prev[agentId], nextRunStatus, nextPayload)) {
                        return {
                          ...prev[agentId],
                          updatedAt: new Date().toISOString(),
                        }
                      }

                      return nextRunStatus
                    })(),
                  }))
                },
              })

              if (isDisposed || !finalPayload || !isCurrentConversation(agentId, nextConversationId)) {
                return
              }

              const assistantText = extractAssistantText(finalPayload, previousAssistantCount)
              const artifacts = extractNewArtifacts(finalPayload)
              const finalRunStatus = extractDisplayRunStatus(agentId, finalPayload)
              const chatCopy = getChatCopy()

              if (normalizeBackendMessages(finalPayload).length > 0 || artifacts.length > 0) {
                updateConversationFromPayload(agentId, finalPayload, getFileReadyResponse())
              } else if (assistantText || artifacts.length > 0) {
                const fallbackText =
                  artifacts.length > 0
                    ? chatCopy.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE
                    : chatCopy.emptyAssistantResponse || DEFAULT_EMPTY_ASSISTANT_RESPONSE

                setConversations((prev) => ({
                  ...prev,
                  [agentId]: [
                    ...(prev[agentId] ?? []),
                    toUiMessage({
                      agentId,
                      role: 'assistant',
                      text: assistantText || fallbackText,
                      artifacts,
                      timestamp: new Date().toISOString(),
                    }),
                  ],
                }))
              }

              const shouldTreatAsCompleted = finalRunStatus.pending === false

              setRunStatusByAgent((prev) => ({
                ...prev,
                [agentId]: shouldTreatAsCompleted
                  ? {
                      ...finalRunStatus,
                      state: 'completed',
                      pending: false,
                      label:
                        artifacts.length > 0
                          ? chatCopy.completedWithFilesStatus
                          : chatCopy.completedStatus,
                      error: null,
                      artifactCount: Math.max(
                        artifacts.length,
                        Number(finalRunStatus.artifactCount ?? 0),
                      ),
                      updatedAt: new Date().toISOString(),
                    }
                  : finalRunStatus,
              }))

              if (shouldTreatAsCompleted) {
                setTaskStatusLabel(agentId, '')
              }
            } catch (error) {
              if (isDisposed || !isCurrentConversation(agentId, nextConversationId)) {
                return
              }

              setRunStatusByAgent((prev) => ({
                ...prev,
                [agentId]: {
                  ...(prev[agentId] ?? {}),
                  state: 'error',
                  pending: false,
                  label: getChatCopy().errorStatus,
                  error: error?.message || getChatCopy().errorStatus,
                  updatedAt: new Date().toISOString(),
                },
              }))
              setTaskStatusLabel(agentId, '')
            } finally {
              if (!isDisposed && isCurrentConversation(agentId, nextConversationId)) {
                setSendingByAgent((prev) => ({
                  ...prev,
                  [agentId]: false,
                }))
              }
            }
          })()
        })
      } catch (error) {
        console.error('Failed to hydrate conversations from backend history:', error)
      }
    }

    hydrateConversations()

    return () => {
      isDisposed = true
    }
  }, [extractDisplayRunStatus, getChatCopy, setTaskStatusLabel, updateConversationFromPayload])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    let isDisposed = false
    const getFileReadyResponse = () =>
      getChatCopy().fileReadyResponse || DEFAULT_FILE_READY_RESPONSE
    const pendingTargets = agentDefinitions
      .filter((agent) => runStatusByAgent[agent.id]?.pending && !sendingByAgent[agent.id])
      .map((agent) => ({
        agentId: agent.id,
        backendName: agent.backendName,
        conversationId: conversationIdsByAgentRef.current[agent.id],
      }))

    if (pendingTargets.length === 0) {
      return () => {
        isDisposed = true
      }
    }

    const timeoutId = window.setTimeout(async () => {
      const settled = await Promise.allSettled(
        pendingTargets.map(async (target) => {
          const payload = await fetchChat({
            agent: target.backendName,
            conversationId: target.conversationId,
            limit: 80,
          })

          return {
            ...target,
            payload,
          }
        }),
      )

      if (isDisposed) {
        return
      }

      setConversations((prev) => {
        const next = { ...prev }

        settled.forEach((result) => {
          if (result.status !== 'fulfilled') {
            return
          }

          const { agentId, conversationId, payload } = result.value

          if (conversationIdsByAgentRef.current[agentId] !== conversationId) {
            return
          }

          const normalizedMessageCount = normalizeBackendMessages(payload).length
          const artifacts = extractNewArtifacts(payload)
          const runStatus = extractDisplayRunStatus(agentId, payload)

          if (
            normalizedMessageCount === 0
            && (artifacts.length === 0 || runStatus.pending)
          ) {
            return
          }

          next[agentId] = buildConversationFromPayload(
            agentId,
            payload,
            prev[agentId] ?? [],
            getFileReadyResponse(),
          )
        })

        return next
      })

      setRunStatusByAgent((prev) => {
        const next = { ...prev }

        settled.forEach((result) => {
          if (result.status !== 'fulfilled') {
            return
          }

          const { agentId, conversationId, payload } = result.value

          if (conversationIdsByAgentRef.current[agentId] !== conversationId) {
            return
          }

          const nextRunStatus = extractDisplayRunStatus(agentId, payload)

          next[agentId] = shouldRetainPendingRunStatus(prev[agentId], nextRunStatus, payload)
            ? {
                ...prev[agentId],
                updatedAt: new Date().toISOString(),
              }
            : nextRunStatus
        })

        return next
      })

      settled.forEach((result) => {
        if (result.status !== 'fulfilled') {
          return
        }

        const { agentId, conversationId, payload } = result.value

        if (conversationIdsByAgentRef.current[agentId] !== conversationId) {
          return
        }

        const nextRunStatus = extractDisplayRunStatus(agentId, payload)
        const retainedPending = shouldRetainPendingRunStatus(
          runStatusByAgent[agentId],
          nextRunStatus,
          payload,
        )

        if (!nextRunStatus.pending && !retainedPending) {
          setTaskStatusLabel(agentId, '')
        }
      })
    }, 3000)

    return () => {
      isDisposed = true
      window.clearTimeout(timeoutId)
    }
  }, [extractDisplayRunStatus, getChatCopy, runStatusByAgent, sendingByAgent, setTaskStatusLabel])

  const agents = useMemo(() => {
    const localizedAgents = buildAgents(language).filter(
      (agent) => agent.isVisibleInUi !== false,
    )

    return localizedAgents.map((agent) => ({
      ...agent,
      status:
        sendingByAgent[agent.id] || runStatusByAgent[agent.id]?.pending
          ? 'busy'
          : agent.status,
    }))
  }, [language, runStatusByAgent, sendingByAgent])

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0]
  const activePreview = previewByAgent[activeAgentId]

  const resolvedConversations = useMemo(() => {
    const translated = {}

    Object.entries(conversations).forEach(([agentId, messages]) => {
      translated[agentId] = messages.map((message) => ({
        ...message,
        text: resolveMessageText(language, message),
      }))
    })

    return translated
  }, [conversations, language])

  const handleLanguageChange = (nextLanguage) => {
    if (languageOrder.includes(nextLanguage)) {
      setLanguage(nextLanguage)
    }
  }

  const handleClearHistory = async (agentId) => {
    if (!agentId || sendingByAgent[agentId] || clearingByAgent[agentId]) {
      return
    }

    const agent = agentDefinitions.find((candidate) => candidate.id === agentId)

    if (!agent) {
      return
    }

    const conversationId = conversationIdsByAgentRef.current[agentId]

    setClearingByAgent((prev) => ({
      ...prev,
      [agentId]: true,
    }))

    try {
      await clearChat({
        agent: agent.backendName,
        conversationId,
      })

      setConversations((prev) => ({
        ...prev,
        [agentId]: [],
      }))

      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: null,
      }))

      setPreviewByAgent((prev) => ({
        ...prev,
        [agentId]: null,
      }))

      setConversationIdsByAgent((prev) => rotateConversationId(prev, agentId))
      setTaskStatusLabel(agentId, '')
    } catch (error) {
      const chatCopy = getChatCopy()
      const message =
        (chatCopy.backendErrorPrefix || DEFAULT_BACKEND_ERROR) +
        (error?.message ? `\n\n${error.message}` : '')

      setConversations((prev) => ({
        ...prev,
        [agentId]: [
          ...(prev[agentId] ?? []),
          toUiMessage({
            agentId,
            role: 'assistant',
            text: message,
            timestamp: new Date().toISOString(),
          }),
        ],
      }))

      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: {
          ...(prev[agentId] ?? {}),
          state: 'error',
          pending: false,
          label: chatCopy.errorStatus,
          error: error?.message ?? message,
          updatedAt: new Date().toISOString(),
        },
      }))
    } finally {
      setClearingByAgent((prev) => ({
        ...prev,
        [agentId]: false,
      }))
    }
  }

  const handlePreviewFile = (agentId, file) => {
    if (!agentId || !file) {
      return
    }

    setPreviewByAgent((prev) => ({
      ...prev,
      [agentId]: file,
    }))
  }

  const handleClosePreview = (agentId) => {
    if (!agentId) {
      return
    }

    setPreviewByAgent((prev) => ({
      ...prev,
      [agentId]: null,
    }))
  }

  const handleSend = async (payload) => {
    const agentId = activeAgentId
    const agent = activeAgent
    const conversationId = conversationIdsByAgentRef.current[agentId]
    const isCurrentConversation = () => conversationIdsByAgentRef.current[agentId] === conversationId

    if (!agent || !conversationId || sendingByAgent[agentId] || clearingByAgent[agentId]) {
      return
    }

    const { text, file } =
      typeof payload === 'string'
        ? { text: payload, file: null }
        : { text: payload?.text ?? '', file: payload?.file ?? null }

    const trimmedText = text?.trim() ?? ''

    if (!trimmedText && !file) {
      return
    }

    const userMessage = toUiMessage({
      agentId,
      role: 'user',
      text: trimmedText,
      file,
      timestamp: new Date().toISOString(),
    })

    setConversations((prev) => ({
      ...prev,
      [agentId]: [...(prev[agentId] ?? []), userMessage],
    }))

    setSendingByAgent((prev) => ({
      ...prev,
      [agentId]: true,
    }))

    try {
      const chatCopyAtStart = getChatCopy()
      const inferredTaskStatusLabel = inferPendingTaskLabel(chatCopyAtStart, trimmedText, file)
      setTaskStatusLabel(agentId, inferredTaskStatusLabel)
      const existingMessages = conversationsRef.current[agentId] ?? []
      const previousAssistantCount = existingMessages.filter((message) => message.role === 'assistant').length
      const knownArtifactSignatures = new Set(
        existingMessages
          .flatMap((message) => [message.file, ...(message.artifacts ?? [])])
          .filter(Boolean)
          .map((artifact) => getUiFileSignature(artifact)),
      )
      const clientMessageCount = existingMessages.length
      const clientLastAssistantText = getLastAssistantMessageText(existingMessages)
      let fileIds = []

      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: {
          state: file ? 'uploading' : 'dispatching',
          pending: true,
          label: file ? chatCopyAtStart.uploadingStatus : chatCopyAtStart.dispatchingStatus,
          startedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          runId: null,
          error: null,
          artifactCount: 0,
          hasUploads: Boolean(file),
        },
      }))

      if (file) {
        const uploadResponse = await uploadFiles({
          agent: agent.backendName,
          conversationId,
          files: [file],
        })

        const uploadedFiles = Array.isArray(uploadResponse.uploaded) ? uploadResponse.uploaded : []
        fileIds = uploadedFiles.map((uploadedFile) => uploadedFile.id).filter(Boolean)

        if (uploadedFiles[0] && isCurrentConversation()) {
          setConversations((prev) => ({
            ...prev,
            [agentId]: attachUploadedFileToUserMessage(
              prev[agentId] ?? [],
              userMessage.id,
              uploadedFiles[0],
            ),
          }))
        }

        if (fileIds.length === 0) {
          throw new Error(DEFAULT_UPLOAD_ERROR)
        }
      }

      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: {
          ...(prev[agentId] ?? {}),
          state: 'dispatching',
          pending: true,
          label: getChatCopy().dispatchingStatus,
          updatedAt: new Date().toISOString(),
          hasUploads: fileIds.length > 0,
        },
      }))

      const backendMessage = buildBackendMessage(trimmedText, fileIds.length > 0)
      const responsePromise = postChat({
        agent: agent.backendName,
        conversationId,
        message: backendMessage,
        fileIds,
        timeoutMs: CHAT_REQUEST_TIMEOUT_MS,
        clientMessageCount,
        clientLastAssistantText,
      })

      let directTimeoutId
      const timeoutPromise = new Promise((resolve) => {
        directTimeoutId = window.setTimeout(
          () =>
            resolve({
              response: null,
              error: null,
              timedOut: true,
            }),
          DIRECT_CHAT_RESPONSE_WAIT_MS,
        )
      })

      const directResult = await Promise.race([
        responsePromise
          .then((response) => ({
            response,
            error: null,
            timedOut: false,
          }))
          .catch((error) => ({
            response: null,
            error,
            timedOut: false,
          })),
        timeoutPromise,
      ])

      if (typeof window !== 'undefined' && directTimeoutId) {
        window.clearTimeout(directTimeoutId)
      }

      if (directResult.error) {
        throw directResult.error
      }

      let finalPayload = directResult.response
      let assistantText = finalPayload ? extractAssistantText(finalPayload, previousAssistantCount) : ''
      let artifacts = finalPayload ? extractNewArtifacts(finalPayload) : []
      const directRunStatus = finalPayload ? extractDisplayRunStatus(agentId, finalPayload) : null

      if (finalPayload) {
        if (isCurrentConversation()) {
          const hasDirectAssistantUpdate = payloadHasAssistantText(
            finalPayload,
            previousAssistantCount,
          )
          const normalizedMessageCount = normalizeBackendMessages(finalPayload).length
          const shouldRenderMessages =
            hasDirectAssistantUpdate
            || (directRunStatus?.pending === false && normalizedMessageCount > 0)
          const shouldRenderArtifacts =
            artifacts.length > 0
            && (directRunStatus?.pending === false || hasDirectAssistantUpdate)

          if (shouldRenderMessages || shouldRenderArtifacts) {
            updateConversationFromPayload(
              agentId,
              finalPayload,
              getChatCopy().fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
            )
          }

          setRunStatusByAgent((prev) => {
            const nextRunStatus = directRunStatus

            return {
              ...prev,
              [agentId]: shouldRetainPendingRunStatus(prev[agentId], nextRunStatus, finalPayload)
                ? {
                    ...prev[agentId],
                    updatedAt: new Date().toISOString(),
                  }
                : nextRunStatus,
            }
          })
        }
      } else {
        if (isCurrentConversation()) {
          setRunStatusByAgent((prev) => ({
            ...prev,
            [agentId]: {
              ...(prev[agentId] ?? {}),
              state: 'running',
              pending: true,
              label: taskStatusLabelByAgentRef.current[agentId] || getChatCopy().runningStatus,
              updatedAt: new Date().toISOString(),
            },
          }))
        }
      }

      if (!assistantText || directRunStatus?.pending) {
        const polledPayload = await pollForChatCompletion({
          agent: agent.backendName,
          conversationId,
          previousAssistantCount,
          knownArtifactSignatures,
          timeoutMs: POLL_TIMEOUT_MS,
          onUpdate: (payload) => {
            if (!isCurrentConversation()) {
              return
            }

            const normalizedMessageCount = normalizeBackendMessages(payload).length
            const artifacts = extractNewArtifacts(payload)
            const runStatus = extractDisplayRunStatus(agentId, payload)
            const hasAssistantTextUpdate = payloadHasAssistantText(payload, previousAssistantCount)
            const shouldRenderMessages =
              hasAssistantTextUpdate || (runStatus.pending === false && normalizedMessageCount > 0)
            const shouldRenderArtifacts =
              artifacts.length > 0 && (runStatus.pending === false || hasAssistantTextUpdate)

            if (shouldRenderMessages || shouldRenderArtifacts) {
              updateConversationFromPayload(
                agentId,
                payload,
                getChatCopy().fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
              )
            }

            setRunStatusByAgent((prev) => {
              const nextRunStatus = extractDisplayRunStatus(agentId, payload)

              return {
                ...prev,
                [agentId]: shouldRetainPendingRunStatus(prev[agentId], nextRunStatus, payload)
                  ? {
                      ...prev[agentId],
                      updatedAt: new Date().toISOString(),
                    }
                  : nextRunStatus,
              }
            })
          },
        })

        if (polledPayload) {
          finalPayload = polledPayload
          assistantText = extractAssistantText(polledPayload, previousAssistantCount)
          artifacts = extractNewArtifacts(polledPayload)

          if (isCurrentConversation()) {
            setRunStatusByAgent((prev) => {
              const nextRunStatus = extractDisplayRunStatus(agentId, polledPayload)

              return {
                ...prev,
                [agentId]: shouldRetainPendingRunStatus(prev[agentId], nextRunStatus, polledPayload)
                  ? {
                      ...prev[agentId],
                      updatedAt: new Date().toISOString(),
                    }
                  : nextRunStatus,
              }
            })
          }
        }
      }

      if (!isCurrentConversation()) {
        return
      }

      const finalRunStatus = finalPayload ? extractDisplayRunStatus(agentId, finalPayload) : null
      const isStillPending = !finalPayload || Boolean(finalRunStatus?.pending)
      const isFileOnlyAssistantMessage = artifacts.length > 0 && !assistantText && !isStillPending
      const chatCopy = getChatCopy()
      const finalAssistantText = isFileOnlyAssistantMessage
        ? chatCopy.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE
        : assistantText || chatCopy.emptyAssistantResponse || DEFAULT_EMPTY_ASSISTANT_RESPONSE
      const normalizedFinalMessageCount = finalPayload
        ? normalizeBackendMessages(finalPayload).length
        : 0
      const hasAssistantTextInFinalPayload = finalPayload
        ? payloadHasAssistantText(finalPayload, previousAssistantCount)
        : false

      if (
        finalPayload
        && (
          normalizedFinalMessageCount > clientMessageCount
          || artifacts.length > 0
          || (hasAssistantTextInFinalPayload && normalizedFinalMessageCount > 0)
        )
      ) {
        updateConversationFromPayload(
          agentId,
          finalPayload,
          chatCopy.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
        )
      } else if (assistantText || artifacts.length > 0 || !isStillPending) {
        setConversations((prev) => ({
          ...prev,
          [agentId]: [
            ...(prev[agentId] ?? []),
            toUiMessage({
              agentId,
              role: 'assistant',
              text: finalAssistantText,
              artifacts,
              timestamp: new Date().toISOString(),
            }),
          ],
        }))
      }

      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: isStillPending
          ? resolvePendingRunStatus(agentId, {
              ...(prev[agentId] ?? {}),
              ...finalRunStatus,
              state: 'running',
              pending: true,
              label:
                taskStatusLabelByAgentRef.current[agentId]
                || finalRunStatus?.label
                || chatCopy.runningStatus,
              error: null,
              hasUploads: fileIds.length > 0 || finalRunStatus?.hasUploads,
              updatedAt: new Date().toISOString(),
            })
          : {
              ...finalRunStatus,
              state: 'completed',
              pending: false,
              label:
                artifacts.length > 0 ? chatCopy.completedWithFilesStatus : chatCopy.completedStatus,
              error: null,
              artifactCount: Math.max(artifacts.length, Number(finalRunStatus?.artifactCount ?? 0)),
              hasUploads: fileIds.length > 0 || finalRunStatus?.hasUploads,
              updatedAt: new Date().toISOString(),
            },
      }))

      if (!isStillPending) {
        setTaskStatusLabel(agentId, '')
      }
    } catch (error) {
      const chatCopy = getChatCopy()
      const message =
        (chatCopy.backendErrorPrefix || DEFAULT_BACKEND_ERROR) +
        (error?.message ? `\n\n${error.message}` : '')

      setConversations((prev) => ({
        ...prev,
        [agentId]: [
          ...(prev[agentId] ?? []),
          toUiMessage({
            agentId,
            role: 'assistant',
            text: message,
            timestamp: new Date().toISOString(),
          }),
        ],
      }))

      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: {
          ...(prev[agentId] ?? {}),
          state: 'error',
          pending: false,
          label: chatCopy.errorStatus,
          error: error?.message ?? message,
          updatedAt: new Date().toISOString(),
        },
      }))
      setTaskStatusLabel(agentId, '')
    } finally {
      setSendingByAgent((prev) => ({
        ...prev,
        [agentId]: false,
      }))
    }
  }

  return (
    <div className="app-shell">
      <main className="workspace-grid" aria-label={copy.app.workspaceAria}>
        <Sidebar
          agents={agents}
          activeAgentId={activeAgentId}
          onSelect={setActiveAgentId}
          conversations={resolvedConversations}
          language={language}
          languageOrder={languageOrder}
          languageCodes={languageCodes}
          onLanguageChange={handleLanguageChange}
          text={copy.sidebar}
          statusLabels={copy.status}
        />
        <div className="workspace-main">
          <ChatPanel
            key={activeAgent.id}
            agent={activeAgent}
            messages={resolvedConversations[activeAgent.id] ?? []}
            onSend={handleSend}
            onClearHistory={() => handleClearHistory(activeAgent.id)}
            onPreviewFile={(file) => handlePreviewFile(activeAgent.id, file)}
            isSending={sendingByAgent[activeAgent.id]}
            isClearing={clearingByAgent[activeAgent.id]}
            runStatus={runStatusByAgent[activeAgent.id]}
            text={copy.chat}
            statusLabels={copy.status}
            locale={localeByLanguage[language]}
          />
          {activePreview ? (
            <FilePreviewPanel
              file={activePreview}
              onClose={() => handleClosePreview(activeAgent.id)}
              text={copy.chat}
            />
          ) : null}
        </div>
      </main>
    </div>
  )
}
