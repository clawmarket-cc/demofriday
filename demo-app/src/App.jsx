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
  extractAssistantText,
  fetchAgentLanes,
  fetchChat,
  normalizeBackendMessages,
  pollForAssistantReply,
  postChat,
} from './api/openclawProxy'

const STORAGE_CLIENT_ID_KEY = 'golemforce-chat-client-id'
const DEFAULT_THREAD_ID = 'main'
const STATUS_REFRESH_MS = 30000

const DEFAULT_BACKEND_ERROR =
  'I could not reach the model backend. Please retry. If this keeps failing, check /health on the proxy.'
const DEFAULT_PENDING_TIMEOUT =
  'The model run is still pending. Try again in a moment or refresh chat history from the backend.'

const createInitialConversations = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, []]))

const createInitialSendingState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, false]))

const createInitialStatusState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, agent.status]))

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

const formatFileSize = (bytes) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const buildBackendMessage = (text, file) => {
  const trimmed = text?.trim() ?? ''

  if (!file) {
    return trimmed
  }

  const attachmentLine = `Attachment metadata: ${file.name} (${formatFileSize(file.size)}, ${
    file.type || 'unknown type'
  })`

  if (trimmed) {
    return `${trimmed}\n\n[${attachmentLine}]`
  }

  return `Please process this attachment. [${attachmentLine}]`
}

const toUiMessage = ({ agentId, role, text, file = null, timestamp, id }) => ({
  id: id ?? `${agentId}-${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  role,
  agentId,
  text,
  file,
  timestamp: timestamp ?? new Date().toISOString(),
})

export default function App() {
  const [language, setLanguage] = useState('en')
  const [activeAgentId, setActiveAgentId] = useState(agentDefinitions[0].id)
  const [conversations, setConversations] = useState(createInitialConversations)
  const [sendingByAgent, setSendingByAgent] = useState(createInitialSendingState)
  const [statusByAgent, setStatusByAgent] = useState(createInitialStatusState)

  const conversationId = useMemo(() => getConversationId(), [])
  const copy = translations[language] ?? translations.en

  useEffect(() => {
    let isDisposed = false

    const syncAgentAvailability = async () => {
      try {
        const payload = await fetchAgentLanes()

        if (isDisposed || !Array.isArray(payload?.agents)) {
          return
        }

        setStatusByAgent((prev) => {
          const next = { ...prev }

          payload.agents.forEach((agent) => {
            if (!agent?.id || !(agent.id in prev)) {
              return
            }

            next[agent.id] = agent.exists ? 'online' : 'offline'
          })

          return next
        })
      } catch (error) {
        console.error('Failed to sync agent availability:', error)
      }
    }

    const hydrateConversations = async () => {
      try {
        const settled = await Promise.allSettled(
          agentDefinitions.map(async (agent) => {
            const payload = await fetchChat({ agentId: agent.id, conversationId, limit: 80 })
            const messages = normalizeBackendMessages(payload)

            return [agent.id, messages]
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

            const [agentId, messages] = result.value

            if ((prev[agentId] ?? []).length > 0) {
              return
            }

            next[agentId] = messages.map((message, index) =>
              toUiMessage({
                agentId,
                role: message.role,
                text: message.text,
                timestamp: message.timestamp,
                id: `${agentId}-${message.timestamp || 'no-ts'}-${index}`,
              }),
            )
          })

          return next
        })
      } catch (error) {
        console.error('Failed to load chat history:', error)
      }
    }

    syncAgentAvailability()
    hydrateConversations()

    const interval = setInterval(syncAgentAvailability, STATUS_REFRESH_MS)

    return () => {
      isDisposed = true
      clearInterval(interval)
    }
  }, [conversationId])

  const agents = useMemo(() => {
    const localizedAgents = buildAgents(language)

    return localizedAgents.map((agent) => ({
      ...agent,
      status: sendingByAgent[agent.id] ? 'busy' : statusByAgent[agent.id] ?? agent.status,
    }))
  }, [language, sendingByAgent, statusByAgent])

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

  const handleSend = async (payload) => {
    const agentId = activeAgentId

    if (sendingByAgent[agentId]) {
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
      file: file ?? null,
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

    const previousAssistantCount = (conversations[agentId] ?? []).filter(
      (message) => message.role === 'assistant',
    ).length

    try {
      const backendMessage = buildBackendMessage(trimmedText, file)

      const response = await postChat({
        agentId,
        conversationId,
        message: backendMessage,
      })

      let assistantText = extractAssistantText(response, previousAssistantCount)

      if (!assistantText && response.pending) {
        assistantText = await pollForAssistantReply({
          agentId,
          conversationId,
          previousAssistantCount,
        })
      }

      const finalAssistantText = assistantText || copy.chat.pendingTimeout || DEFAULT_PENDING_TIMEOUT

      setConversations((prev) => ({
        ...prev,
        [agentId]: [
          ...(prev[agentId] ?? []),
          toUiMessage({
            agentId,
            role: 'assistant',
            text: finalAssistantText,
            timestamp: new Date().toISOString(),
          }),
        ],
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
          isSending={sendingByAgent[activeAgent.id]}
          text={copy.chat}
          statusLabels={copy.status}
          locale={localeByLanguage[language]}
        />
      </main>
    </div>
  )
}
