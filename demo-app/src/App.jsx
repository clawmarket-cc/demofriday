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
  extractArtifacts,
  extractAssistantText,
  fetchChat,
  normalizeBackendMessages,
  pollForAssistantReply,
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
const DIRECT_CHAT_RESPONSE_WAIT_MS = 2500

const createInitialConversations = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, []]))

const createInitialSendingState = () =>
  Object.fromEntries(agentDefinitions.map((agent) => [agent.id, false]))

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

  return {
    id: file.id ?? file.fileId ?? null,
    name: file.name ?? file.fileName ?? file.filename ?? 'Attachment',
    size: Number(file.size ?? 0) || 0,
    type: file.type ?? file.mimeType ?? '',
    downloadUrl: file.downloadUrl ?? '',
  }
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

const toUiMessage = ({ agentId, role, text, file = null, artifacts = [], timestamp, id }) => ({
  id: id ?? `${agentId}-${role}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  role,
  agentId,
  text,
  file: toUiFile(file),
  artifacts: Array.isArray(artifacts) ? artifacts.map((artifact) => toUiFile(artifact)).filter(Boolean) : [],
  timestamp: timestamp ?? new Date().toISOString(),
})

export default function App() {
  const [language, setLanguage] = useState('en')
  const [activeAgentId, setActiveAgentId] = useState(agentDefinitions[0].id)
  const [conversations, setConversations] = useState(createInitialConversations)
  const [sendingByAgent, setSendingByAgent] = useState(createInitialSendingState)

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
        console.error('Failed to hydrate conversations from backend history:', error)
      }
    }

    hydrateConversations()

    return () => {
      isDisposed = true
    }
  }, [conversationId])

  const agents = useMemo(() => {
    const localizedAgents = buildAgents(language)

    return localizedAgents.map((agent) => ({
      ...agent,
      status: sendingByAgent[agent.id] ? 'busy' : agent.status,
    }))
  }, [language, sendingByAgent])

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
      const previousAssistantCount = (conversations[agentId] ?? []).filter(
        (message) => message.role === 'assistant',
      ).length
      let fileIds = []

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

      const backendMessage = buildBackendMessage(trimmedText, fileIds.length > 0)
      const responsePromise = postChat({
        agent: agent.backendName,
        conversationId,
        message: backendMessage,
        fileIds,
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

      let assistantText = directResult.response ? extractAssistantText(directResult.response) : ''
      const artifacts = directResult.response ? extractArtifacts(directResult.response) : []

      if (!assistantText) {
        assistantText = await pollForAssistantReply({
          agent: agent.backendName,
          conversationId,
          previousAssistantCount,
        })
      }

      const finalAssistantText =
        assistantText || copy.chat.emptyAssistantResponse || DEFAULT_EMPTY_ASSISTANT_RESPONSE

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
