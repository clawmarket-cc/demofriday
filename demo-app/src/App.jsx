import { useEffect, useMemo, useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'
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

const STORAGE_CLIENT_ID_KEY = 'golemforce-chat-client-id'
const DEFAULT_THREAD_ID = 'main'

const DEFAULT_FILE_PROMPT = 'Please analyze the uploaded file.'
const DEFAULT_BACKEND_ERROR =
  'I could not reach the model backend. Please retry. If this keeps failing, check /health on the proxy.'
const DEFAULT_EMPTY_ASSISTANT_RESPONSE = 'The backend completed without returning assistant text.'
const DEFAULT_UPLOAD_ERROR = 'Upload completed without returning a file id.'
const CHAT_REQUEST_TIMEOUT_MS = 3000
const DIRECT_CHAT_RESPONSE_WAIT_MS = 2500
const POLL_TIMEOUT_MS = 120000

const createInitialConversations = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, []]))

const createInitialSendingState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, false]))

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

const getConversationId = () => {
  if (typeof window === 'undefined') {
    return `local:${DEFAULT_THREAD_ID}`
  }

  try {
    const existing = window.localStorage.getItem(STORAGE_CLIENT_ID_KEY)
    const clientId = existing || createClientId()

    if (!existing) {
      window.localStorage.setItem(STORAGE_CLIENT_ID_KEY, clientId)
    }

    return `${clientId}:${DEFAULT_THREAD_ID}`
  } catch {
    return `volatile-${createClientId()}:${DEFAULT_THREAD_ID}`
  }
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

const buildConversationFromPayload = (agentId, payload) => {
  const messages = normalizeBackendMessages(payload).map((message, index) =>
    toUiMessage({
      agentId,
      role: message.role,
      text: message.text,
      timestamp: message.timestamp,
      id: `${agentId}-${message.timestamp || 'no-ts'}-${index}`,
    }),
  )
  const artifacts = extractNewArtifacts(payload)
  const withArtifacts = attachArtifactsToLatestAssistant(messages, artifacts)

  if (withArtifacts) {
    return withArtifacts
  }

  if (artifacts.length === 0) {
    return messages
  }

  return [
    ...messages,
    toUiMessage({
      agentId,
      role: 'assistant',
      text: '',
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

  const conversationId = useMemo(() => getConversationId(), [])
  const copy = translations[language] ?? translations.en

  useEffect(() => {
    let isDisposed = false

    const hydrateConversations = async () => {
      try {
        const settled = await Promise.allSettled(
          agentDefinitions.map(async (agent) => {
            const payload = await fetchChat({
              agent: agent.backendName,
              conversationId,
              limit: 80,
            })

            return [agent.id, payload]
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

            const [agentId, payload] = result.value

            if ((prev[agentId] ?? []).length > 0) {
              return
            }

            next[agentId] = buildConversationFromPayload(agentId, payload)
          })

          return next
        })

        setRunStatusByAgent((prev) => {
          const next = { ...prev }

          settled.forEach((result) => {
            if (result.status !== 'fulfilled') {
              return
            }

            const [agentId, payload] = result.value
            next[agentId] = extractRunStatus(payload)
          })

          return next
        })

        settled.forEach((result) => {
          if (result.status !== 'fulfilled') {
            return
          }

          const [agentId, payload] = result.value
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
                conversationId,
                previousAssistantCount,
                timeoutMs: POLL_TIMEOUT_MS,
                onUpdate: (nextPayload) => {
                  if (isDisposed) {
                    return
                  }

                  if (
                    normalizeBackendMessages(nextPayload).length > 0 ||
                    extractNewArtifacts(nextPayload).length > 0
                  ) {
                    setConversations((prev) => ({
                      ...prev,
                      [agentId]: buildConversationFromPayload(agentId, nextPayload),
                    }))
                  }

                  setRunStatusByAgent((prev) => ({
                    ...prev,
                    [agentId]: extractRunStatus(nextPayload),
                  }))
                },
              })

              if (isDisposed || !finalPayload) {
                return
              }

              const assistantText = extractAssistantText(finalPayload, previousAssistantCount)
              const artifacts = extractNewArtifacts(finalPayload)
              const finalRunStatus = extractRunStatus(finalPayload)

              if (normalizeBackendMessages(finalPayload).length > 0 || artifacts.length > 0) {
                setConversations((prev) => ({
                  ...prev,
                  [agentId]: buildConversationFromPayload(agentId, finalPayload),
                }))
              } else if (assistantText || artifacts.length > 0) {
                setConversations((prev) => ({
                  ...prev,
                  [agentId]: [
                    ...(prev[agentId] ?? []),
                    toUiMessage({
                      agentId,
                      role: 'assistant',
                      text:
                        assistantText
                        || copy.chat.emptyAssistantResponse
                        || DEFAULT_EMPTY_ASSISTANT_RESPONSE,
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
              if (isDisposed) {
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
              if (!isDisposed) {
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
    conversationId,
    copy.chat.completedStatus,
    copy.chat.completedWithFilesStatus,
    copy.chat.emptyAssistantResponse,
    copy.chat.errorStatus,
  ])

  const agents = useMemo(() => {
    const localizedAgents = buildAgents(language)

    return localizedAgents.map((agent) => ({
      ...agent,
      status:
        sendingByAgent[agent.id] || runStatusByAgent[agent.id]?.pending ? 'busy' : agent.status,
    }))
  }, [language, runStatusByAgent, sendingByAgent])

  const activeAgent = agents.find((agent) => agent.id === activeAgentId) ?? agents[0]

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

  const handleSend = async (payload) => {
    const agentId = activeAgentId
    const agent = activeAgent

    if (!agent || sendingByAgent[agentId]) {
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

        fileIds = (uploadResponse.uploaded ?? []).map((uploadedFile) => uploadedFile.id).filter(Boolean)

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
        setRunStatusByAgent((prev) => ({
          ...prev,
          [agentId]: extractRunStatus(finalPayload),
        }))
      } else {
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

      if (!assistantText || extractRunStatus(finalPayload).pending) {
        const polledPayload = await pollForChatCompletion({
          agent: agent.backendName,
          conversationId,
          previousAssistantCount,
          timeoutMs: POLL_TIMEOUT_MS,
          onUpdate: (payload) => {
            if (
              normalizeBackendMessages(payload).length > clientMessageCount ||
              extractNewArtifacts(payload).length > 0
            ) {
              setConversations((prev) => ({
                ...prev,
                [agentId]: buildConversationFromPayload(agentId, payload),
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

          setRunStatusByAgent((prev) => ({
            ...prev,
            [agentId]: extractRunStatus(polledPayload),
          }))
        }
      }

      const finalRunStatus = extractRunStatus(finalPayload)
      const isStillPending = !finalPayload || finalRunStatus.pending
      const isFileOnlyAssistantMessage = artifacts.length > 0 && !assistantText && !isStillPending
      const finalAssistantText = isFileOnlyAssistantMessage
        ? ''
        : assistantText
          || (isStillPending
            ? copy.chat.pendingTimeout
            : copy.chat.emptyAssistantResponse || DEFAULT_EMPTY_ASSISTANT_RESPONSE)

      if (
        finalPayload
        && (normalizeBackendMessages(finalPayload).length > clientMessageCount || artifacts.length > 0)
      ) {
        setConversations((prev) => ({
          ...prev,
          [agentId]: buildConversationFromPayload(agentId, finalPayload),
        }))
      } else if (assistantText || artifacts.length > 0 || isStillPending) {
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
        <ChatPanel
          key={activeAgent.id}
          agent={activeAgent}
          messages={resolvedConversations[activeAgent.id] ?? []}
          onSend={handleSend}
          onClearHistory={() => handleClearHistory(activeAgent.id)}
          isSending={sendingByAgent[activeAgent.id]}
          runStatus={runStatusByAgent[activeAgent.id]}
          text={copy.chat}
          statusLabels={copy.status}
          locale={localeByLanguage[language]}
        />
      </main>
    </div>
  )
}
