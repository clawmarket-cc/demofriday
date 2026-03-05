import { useEffect, useMemo, useRef, useState } from 'react'
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
import { isAwaitingVisibleAgentResult } from './utils/chatFlow'

const STORAGE_CLIENT_ID_KEY = 'golemforce-chat-client-id'
const STORAGE_CONVERSATION_IDS_KEY = 'golemforce-chat-conversation-ids'
const STORAGE_RUNTIME_CONVERSATIONS_KEY = 'golemforce-chat-runtime-conversations'
const RUNTIME_CONVERSATIONS_CACHE_KEY = '__golemforce-chat-runtime-conversations'
const DEFAULT_THREAD_ID = 'main'

const DEFAULT_FILE_PROMPT = 'Please analyze the uploaded file.'
const DEFAULT_BACKEND_ERROR =
  'I could not reach the model backend. Please retry. If this keeps failing, check /health on the proxy.'
const DEFAULT_EMPTY_ASSISTANT_RESPONSE = 'The backend completed without returning assistant text.'
const DEFAULT_FILE_READY_RESPONSE = 'Your generated file is ready.'
const DEFAULT_UPLOAD_ERROR = 'Upload completed without returning a file id.'
const CHAT_REQUEST_TIMEOUT_MS = 3000
const DIRECT_CHAT_RESPONSE_WAIT_MS = 2500
const POLL_TIMEOUT_MS = 120000

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

const createInitialRunStatusState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, null]))

const createInitialPreviewState = () =>
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
    const existing = window.sessionStorage.getItem(STORAGE_CLIENT_ID_KEY)
    const clientId = existing || createClientId()

    if (!existing) {
      window.sessionStorage.setItem(STORAGE_CLIENT_ID_KEY, clientId)
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
  if (typeof window === 'undefined') {
    return {}
  }

  try {
    const raw = window.sessionStorage.getItem(STORAGE_CONVERSATION_IDS_KEY)

    if (!raw) {
      return {}
    }

    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

const persistConversationIds = (conversationIds) => {
  if (typeof window === 'undefined') {
    return
  }

  try {
    window.sessionStorage.setItem(STORAGE_CONVERSATION_IDS_KEY, JSON.stringify(conversationIds))
  } catch {
    // Ignore sessionStorage persistence failures and keep the in-memory ids.
  }
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

const toUiArtifacts = (artifacts = []) => {
  const seen = new Set()
  const normalizedArtifacts = []

  artifacts.forEach((artifact) => {
    const normalizedArtifact = toUiFile(artifact)

    if (!normalizedArtifact) {
      return
    }

    const dedupeKey =
      normalizedArtifact.id
      || normalizedArtifact.downloadUrl
      || `${normalizedArtifact.name}-${normalizedArtifact.size}-${normalizedArtifact.type}`

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
  nextMessages[lastIndex] = {
    ...lastMessage,
    artifacts: toUiArtifacts(artifacts),
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
      (!Array.isArray(merged.artifacts) || merged.artifacts.length === 0)
      && Array.isArray(fallbackMessage?.artifacts)
      && fallbackMessage.artifacts.length > 0
    ) {
      merged.artifacts = toUiArtifacts(fallbackMessage.artifacts)
    }

    return merged
  })
}

const buildMessageExactSignature = (message) =>
  `${message?.role ?? ''}|${message?.timestamp ?? ''}|${message?.text ?? ''}`

const buildMessageLooseSignature = (message) => `${message?.role ?? ''}|${message?.text ?? ''}`

const appendMissingConversationMessages = (primaryMessages, secondaryMessages) => {
  const nextMessages = [...primaryMessages]
  const seenExactSignatures = new Set(nextMessages.map((message) => buildMessageExactSignature(message)))
  const seenLooseSignatures = new Set(nextMessages.map((message) => buildMessageLooseSignature(message)))

  secondaryMessages.forEach((message) => {
    const exactSignature = buildMessageExactSignature(message)
    const looseSignature = buildMessageLooseSignature(message)

    if (seenExactSignatures.has(exactSignature) || seenLooseSignatures.has(looseSignature)) {
      return
    }

    seenExactSignatures.add(exactSignature)
    seenLooseSignatures.add(looseSignature)
    nextMessages.push(message)
  })

  return nextMessages
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

  return appendMissingConversationMessages(backendMessages, fallbackMessages)
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
      text: message.text,
      timestamp: message.timestamp,
      id: `${agentId}-${message.timestamp || 'no-ts'}-${index}`,
    }),
  )
  const messages = mergeConversationMessages(normalizedMessages, fallbackMessages)
  const mergedMessages = mergeConversationMetadataFromFallback(messages, fallbackMessages)
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
  const [runStatusByAgent, setRunStatusByAgent] = useState(createInitialRunStatusState)
  const [conversationIdsByAgent, setConversationIdsByAgent] = useState(createInitialConversationIds)
  const [previewByAgent, setPreviewByAgent] = useState(createInitialPreviewState)

  const conversationIdsByAgentRef = useRef(conversationIdsByAgent)
  const copy = translations[language] ?? translations.en

  useEffect(() => {
    conversationIdsByAgentRef.current = conversationIdsByAgent
  }, [conversationIdsByAgent])

  useEffect(() => {
    persistRuntimeConversations(conversations)
  }, [conversations])

  useEffect(() => {
    let isDisposed = false
    const isCurrentConversation = (agentId, nextConversationId) =>
      conversationIdsByAgentRef.current[agentId] === nextConversationId

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
              copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
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

            next[agentId] = extractRunStatus(payload)
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

          const runStatus = extractRunStatus(payload)
          const agent = agentDefinitions.find((candidate) => candidate.id === agentId)

          if (!agent || !runStatus.pending) {
            return
          }

          const previousAssistantCount = normalizeBackendMessages(payload).filter(
            (message) => message.role === 'assistant',
          ).length

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
                timeoutMs: POLL_TIMEOUT_MS,
                onUpdate: (nextPayload) => {
                  if (isDisposed || !isCurrentConversation(agentId, nextConversationId)) {
                    return
                  }

                  const normalizedMessageCount = normalizeBackendMessages(nextPayload).length
                  const artifacts = extractNewArtifacts(nextPayload)
                  const nextRunStatus = extractRunStatus(nextPayload)

                  if (
                    normalizedMessageCount > 0 ||
                    (artifacts.length > 0 && nextRunStatus.pending === false)
                  ) {
                    setConversations((prev) => ({
                      ...prev,
                      [agentId]: buildConversationFromPayload(
                        agentId,
                        nextPayload,
                        prev[agentId] ?? [],
                        copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
                      ),
                    }))
                  }

                  setRunStatusByAgent((prev) => ({
                    ...prev,
                    [agentId]: extractRunStatus(nextPayload),
                  }))
                },
              })

              if (isDisposed || !finalPayload || !isCurrentConversation(agentId, nextConversationId)) {
                return
              }

              const assistantText = extractAssistantText(finalPayload, previousAssistantCount)
              const artifacts = extractNewArtifacts(finalPayload)
              const finalRunStatus = extractRunStatus(finalPayload)

              if (normalizeBackendMessages(finalPayload).length > 0 || artifacts.length > 0) {
                setConversations((prev) => ({
                  ...prev,
                  [agentId]: buildConversationFromPayload(
                    agentId,
                    finalPayload,
                    prev[agentId] ?? [],
                    copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
                  ),
                }))
              } else if (assistantText || artifacts.length > 0) {
                const fallbackText =
                  artifacts.length > 0
                    ? copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE
                    : copy.chat.emptyAssistantResponse || DEFAULT_EMPTY_ASSISTANT_RESPONSE

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

              setRunStatusByAgent((prev) => ({
                ...prev,
                [agentId]: finalRunStatus.pending
                  ? finalRunStatus
                  : {
                      ...finalRunStatus,
                      state: 'completed',
                      pending: false,
                      label:
                        artifacts.length > 0
                          ? copy.chat.completedWithFilesStatus
                          : copy.chat.completedStatus,
                      error: null,
                      artifactCount: Math.max(
                        artifacts.length,
                        Number(finalRunStatus.artifactCount ?? 0),
                      ),
                      updatedAt: new Date().toISOString(),
                    },
              }))
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
                  label: copy.chat.errorStatus,
                  error: error?.message || copy.chat.errorStatus,
                  updatedAt: new Date().toISOString(),
                },
              }))
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
  }, [
    copy.chat.completedStatus,
    copy.chat.completedWithFilesStatus,
    copy.chat.emptyAssistantResponse,
    copy.chat.errorStatus,
    copy.chat.fileReadyResponse,
  ])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined
    }

    let isDisposed = false
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
          const runStatus = extractRunStatus(payload)

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
            copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
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

          next[agentId] = extractRunStatus(payload)
        })

        return next
      })
    }, 3000)

    return () => {
      isDisposed = true
      window.clearTimeout(timeoutId)
    }
  }, [copy.chat.fileReadyResponse, runStatusByAgent, sendingByAgent])

  const agents = useMemo(() => {
    const localizedAgents = buildAgents(language)

    return localizedAgents.map((agent) => ({
      ...agent,
      status: isAwaitingVisibleAgentResult({
        messages: conversations[agent.id] ?? [],
        isSending: sendingByAgent[agent.id],
        runStatus: runStatusByAgent[agent.id],
      })
        ? 'busy'
        : agent.status,
    }))
  }, [conversations, language, runStatusByAgent, sendingByAgent])

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
    if (!agentId || sendingByAgent[agentId]) {
      return
    }

    const agent = agentDefinitions.find((candidate) => candidate.id === agentId)

    if (!agent) {
      return
    }

    const conversationId = conversationIdsByAgentRef.current[agentId]

    setSendingByAgent((prev) => ({
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
    } catch (error) {
      const message =
        (copy.chat.backendErrorPrefix || DEFAULT_BACKEND_ERROR) +
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
          label: copy.chat.errorStatus,
          error: error?.message ?? message,
          updatedAt: new Date().toISOString(),
        },
      }))
    } finally {
      setSendingByAgent((prev) => ({
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

  const handleRefreshRun = async (agentId) => {
    if (!agentId) {
      return
    }

    const agent = agentDefinitions.find((candidate) => candidate.id === agentId)
    const conversationId = conversationIdsByAgentRef.current[agentId]

    if (!agent || !conversationId) {
      return
    }

    setRunStatusByAgent((prev) => ({
      ...prev,
      [agentId]: {
        ...(prev[agentId] ?? {}),
        state: 'running',
        pending: true,
        label: copy.chat.refreshingStatus || copy.chat.runningStatus,
        error: null,
        updatedAt: new Date().toISOString(),
      },
    }))

    try {
      const payload = await fetchChat({
        agent: agent.backendName,
        conversationId,
        limit: 80,
      })

      if (conversationIdsByAgentRef.current[agentId] !== conversationId) {
        return
      }

      const normalizedMessageCount = normalizeBackendMessages(payload).length
      const artifacts = extractNewArtifacts(payload)
      const runStatus = extractRunStatus(payload)

      if (normalizedMessageCount > 0 || (artifacts.length > 0 && runStatus.pending === false)) {
        setConversations((prev) => ({
          ...prev,
          [agentId]: buildConversationFromPayload(
            agentId,
            payload,
            prev[agentId] ?? [],
            copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
          ),
        }))
      }

      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: runStatus.pending
          ? {
              ...runStatus,
              label: runStatus.label || copy.chat.runningStatus,
              updatedAt: new Date().toISOString(),
            }
          : runStatus,
      }))
    } catch (error) {
      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: {
          ...(prev[agentId] ?? {}),
          state: 'error',
          pending: false,
          label: copy.chat.errorStatus,
          error: error?.message || copy.chat.errorStatus,
          updatedAt: new Date().toISOString(),
        },
      }))
    }
  }

  const handleSend = async (payload) => {
    const agentId = activeAgentId
    const agent = activeAgent
    const conversationId = conversationIdsByAgentRef.current[agentId]
    const isCurrentConversation = () => conversationIdsByAgentRef.current[agentId] === conversationId

    if (!agent || !conversationId || sendingByAgent[agentId]) {
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
      const existingMessages = conversations[agentId] ?? []
      const previousAssistantCount = existingMessages.filter((message) => message.role === 'assistant').length
      const clientMessageCount = existingMessages.length
      const clientLastAssistantText = getLastAssistantMessageText(existingMessages)
      let fileIds = []

      setRunStatusByAgent((prev) => ({
        ...prev,
        [agentId]: {
          state: file ? 'uploading' : 'dispatching',
          pending: true,
          label: file ? copy.chat.uploadingStatus : copy.chat.dispatchingStatus,
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
          label: copy.chat.dispatchingStatus,
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
        new Promise((resolve) => {
          window.setTimeout(
            () =>
              resolve({
                response: null,
                error: null,
                timedOut: true,
              }),
            DIRECT_CHAT_RESPONSE_WAIT_MS,
          )
        }),
      ])

      if (directResult.error) {
        throw directResult.error
      }

      let finalPayload = directResult.response
      let assistantText = finalPayload ? extractAssistantText(finalPayload, previousAssistantCount) : ''
      let artifacts = finalPayload ? extractNewArtifacts(finalPayload) : []

      if (finalPayload) {
        if (isCurrentConversation()) {
          setRunStatusByAgent((prev) => ({
            ...prev,
            [agentId]: extractRunStatus(finalPayload),
          }))
        }
      } else {
        if (isCurrentConversation()) {
          setRunStatusByAgent((prev) => ({
            ...prev,
            [agentId]: {
              ...(prev[agentId] ?? {}),
              state: 'running',
              pending: true,
              label: copy.chat.runningStatus,
              updatedAt: new Date().toISOString(),
            },
          }))
        }
      }

      if (!assistantText || extractRunStatus(finalPayload).pending) {
        const polledPayload = await pollForChatCompletion({
          agent: agent.backendName,
          conversationId,
          previousAssistantCount,
          timeoutMs: POLL_TIMEOUT_MS,
          onUpdate: (payload) => {
            if (!isCurrentConversation()) {
              return
            }

            const normalizedMessageCount = normalizeBackendMessages(payload).length
            const artifacts = extractNewArtifacts(payload)
            const runStatus = extractRunStatus(payload)
            const hasNewMessages = normalizedMessageCount > clientMessageCount
            const shouldRenderArtifacts = artifacts.length > 0 && (hasNewMessages || !runStatus.pending)

            if (hasNewMessages || shouldRenderArtifacts) {
              setConversations((prev) => ({
                ...prev,
                [agentId]: buildConversationFromPayload(
                  agentId,
                  payload,
                  prev[agentId] ?? [],
                  copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
                ),
              }))
            }

            setRunStatusByAgent((prev) => ({
              ...prev,
              [agentId]: extractRunStatus(payload),
            }))
          },
        })

        if (polledPayload) {
          finalPayload = polledPayload
          assistantText = extractAssistantText(polledPayload, previousAssistantCount)
          artifacts = extractNewArtifacts(polledPayload)

          if (isCurrentConversation()) {
            setRunStatusByAgent((prev) => ({
              ...prev,
              [agentId]: extractRunStatus(polledPayload),
            }))
          }
        }
      }

      if (!isCurrentConversation()) {
        return
      }

      const finalRunStatus = extractRunStatus(finalPayload)
      const isStillPending = !finalPayload || finalRunStatus.pending
      const isFileOnlyAssistantMessage = artifacts.length > 0 && !assistantText && !isStillPending
      const finalAssistantText = isFileOnlyAssistantMessage
        ? copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE
        : assistantText || copy.chat.emptyAssistantResponse || DEFAULT_EMPTY_ASSISTANT_RESPONSE

      if (
        finalPayload
        && (normalizeBackendMessages(finalPayload).length > clientMessageCount || artifacts.length > 0)
      ) {
        setConversations((prev) => ({
          ...prev,
          [agentId]: buildConversationFromPayload(
            agentId,
            finalPayload,
            prev[agentId] ?? [],
            copy.chat.fileReadyResponse || DEFAULT_FILE_READY_RESPONSE,
          ),
        }))
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
          ? {
              ...(prev[agentId] ?? {}),
              ...finalRunStatus,
              state: 'running',
              pending: true,
              label: copy.chat.runningStatus,
              error: null,
              hasUploads: fileIds.length > 0 || finalRunStatus.hasUploads,
              updatedAt: new Date().toISOString(),
            }
          : {
              ...finalRunStatus,
              state: 'completed',
              pending: false,
              label:
                artifacts.length > 0 ? copy.chat.completedWithFilesStatus : copy.chat.completedStatus,
              error: null,
              artifactCount: Math.max(artifacts.length, Number(finalRunStatus.artifactCount ?? 0)),
              hasUploads: fileIds.length > 0 || finalRunStatus.hasUploads,
              updatedAt: new Date().toISOString(),
            },
      }))
    } catch (error) {
      const message =
        (copy.chat.backendErrorPrefix || DEFAULT_BACKEND_ERROR) +
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
          label: copy.chat.errorStatus,
          error: error?.message ?? message,
          updatedAt: new Date().toISOString(),
        },
      }))
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
            onRefreshRun={() => handleRefreshRun(activeAgent.id)}
            onPreviewFile={(file) => handlePreviewFile(activeAgent.id, file)}
            isSending={sendingByAgent[activeAgent.id]}
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
