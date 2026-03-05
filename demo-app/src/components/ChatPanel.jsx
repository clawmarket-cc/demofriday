import { useEffect, useRef, useState } from 'react'
import MessageBubble from './MessageBubble'

const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024
const MAX_FILE_SIZE_LABEL = '25 MB'
const ACCEPTED_FILES = '.pdf,.xls,.xlsx,.doc,.docx,.ppt,.pptx'
const ACCEPTED_EXTENSIONS = new Set(['pdf', 'xls', 'xlsx', 'doc', 'docx', 'ppt', 'pptx'])
const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
])

const defaultChatText = {
  conversationAria: '{agent} conversation',
  readyChip: 'Ready to Assist',
  emptyTitle: 'Start with a clear task for {agent}',
  hints: ['Summarize this file', 'Find high-risk clauses', 'Build a quick report'],
  typingAria: '{agent} is typing',
  attachFileAria: 'Attach file',
  messagePlaceholder: 'Message {agent}...',
  sendMessageAria: 'Send message',
  clearHistoryAria: 'Clear chat history for {agent}',
  clearHistoryTooltip: 'Clear chat history',
  clearHistoryConfirm: 'Clear all messages in the {agent} chat?',
  fileTooLarge: 'File is too large. Maximum size is {maxSize}.',
  fileTypeError: 'Unsupported file type. Upload PDF, Excel, Word, or PowerPoint files.',
  removeAttachmentAria: 'Remove attachment',
}

const defaultStatusLabels = {
  online: 'Online',
  busy: 'Busy',
  offline: 'Offline',
}

const interpolate = (template, values) =>
  (typeof template === 'string' ? template : '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '')

const hasDraggedFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files')

const getFileExtension = (filename) => {
  const lastDot = filename.lastIndexOf('.')
  if (lastDot === -1) return ''
  return filename.slice(lastDot + 1).toLowerCase()
}

const isSupportedFile = (file) => {
  const extension = getFileExtension(file.name)
  return ACCEPTED_EXTENSIONS.has(extension) || ACCEPTED_MIME_TYPES.has(file.type)
}

const getStatusMeta = (status, statusLabels) => {
  if (status === 'online') return { color: '#22c55e', label: statusLabels.online }
  if (status === 'busy') return { color: '#eab308', label: statusLabels.busy }
  return { color: '#ef4444', label: statusLabels.offline }
}

export default function ChatPanel({
  agent,
  messages,
  onSend,
  onClearHistory,
  isSending = false,
  text = defaultChatText,
  statusLabels = defaultStatusLabels,
  locale,
}) {
  const copy = { ...defaultChatText, ...text }
  const labels = { ...defaultStatusLabels, ...statusLabels }

  const [input, setInput] = useState('')
  const [selectedFile, setSelectedFile] = useState(null)
  const [uploadError, setUploadError] = useState('')
  const [isDragActive, setIsDragActive] = useState(false)
  const dragDepthRef = useRef(0)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [agent.id])

  const clearAttachment = () => {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const setFile = (file) => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setUploadError(interpolate(copy.fileTooLarge, { maxSize: MAX_FILE_SIZE_LABEL }))
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    if (!isSupportedFile(file)) {
      setUploadError(copy.fileTypeError)
      setSelectedFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
      return
    }

    setUploadError('')
    setSelectedFile(file)
  }

  const handleAttachClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setFile(file)
  }

  const handleDragEnter = (event) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    dragDepthRef.current += 1
    setIsDragActive(true)
  }

  const handleDragOver = (event) => {
    if (!hasDraggedFiles(event)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
    if (!isDragActive) setIsDragActive(true)
  }

  const handleDragLeave = (event) => {
    event.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) {
      setIsDragActive(false)
    }
  }

  const handleDrop = (event) => {
    event.preventDefault()
    dragDepthRef.current = 0
    setIsDragActive(false)
    const file = event.dataTransfer.files?.[0]
    if (!file) return
    setFile(file)
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    const trimmedInput = input.trim()

    if (!trimmedInput && !selectedFile) return

    onSend({
      text: trimmedInput,
      file: selectedFile,
    })

    setInput('')
    setSelectedFile(null)
    setUploadError('')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const hasUserMessages = messages.some((message) => message.role === 'user')
  const hasMessages = messages.length > 0
  const isTyping = messages[messages.length - 1]?.role === 'user'
  const { color: statusColor, label: statusLabel } = getStatusMeta(agent.status, labels)
  const hints = Array.isArray(agent.hints) && agent.hints.length > 0 ? agent.hints : copy.hints
  const canSend = Boolean(input.trim() || selectedFile) && !isSending
  const canClearHistory = hasMessages && !isSending
  const composerClasses = [
    'composer-shell',
    isDragActive ? 'is-drag-active' : '',
    uploadError ? 'has-error' : '',
  ]
    .filter(Boolean)
    .join(' ')

  const handleClearHistory = () => {
    if (!canClearHistory || typeof onClearHistory !== 'function') {
      return
    }

    const confirmMessage = interpolate(copy.clearHistoryConfirm, { agent: agent.name })

    if (typeof window !== 'undefined' && !window.confirm(confirmMessage)) {
      return
    }

    onClearHistory()
  }

  return (
    <section
      className="panel chat-panel"
      style={{
        '--agent-color': agent.color,
        '--agent-tint': `${agent.color}20`,
        '--agent-border': `${agent.color}66`,
        '--status-color': statusColor,
        '--status-border': `${statusColor}4d`,
        '--status-bg': `${statusColor}14`,
        '--status-text': statusColor,
      }}
      aria-label={interpolate(copy.conversationAria, { agent: agent.name })}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <header className="chat-header">
        <div className="chat-agent-mark" aria-hidden="true">
          {agent.logo ? (
            <img className="agent-logo-image" src={agent.logo} alt="" />
          ) : (
            agent.icon
          )}
        </div>

        <div className="chat-agent-copy">
          <h2>{agent.name}</h2>
        </div>

        <div className="chat-header-actions">
          <span className="chat-status-pill">
            <span className="chat-status-dot" aria-hidden="true" />
            {statusLabel}
          </span>
          <button
            type="button"
            className="chat-clear-history-btn"
            onClick={handleClearHistory}
            disabled={!canClearHistory}
            aria-label={interpolate(copy.clearHistoryAria, { agent: agent.name })}
            title={interpolate(copy.clearHistoryTooltip, { agent: agent.name })}
          >
            <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.7"
                d="M4 7h16M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-6 4v7m6-7v7m-7 3h8a1 1 0 001-1V7H7v13a1 1 0 001 1z"
              />
            </svg>
          </button>
        </div>
      </header>

      <div className="chat-stream">
        {!hasUserMessages ? (
          <div className="chat-empty">
            <div className="empty-card">
              <span className="empty-chip">{copy.readyChip}</span>
              <h3 className="empty-title">{interpolate(copy.emptyTitle, { agent: agent.name })}</h3>
              <p className="empty-copy">{agent.greeting}</p>

              <div className="empty-hints" aria-hidden="true">
                {hints.map((hint) => (
                  <span className="empty-hint" key={hint}>
                    {hint}
                  </span>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-scroll-content">
            {messages.map((message) => (
              <MessageBubble
                key={message.id}
                message={message}
                agent={agent}
                locale={locale}
                text={copy}
              />
            ))}

            {isTyping && (
              <div
                className="typing-row"
                aria-live="polite"
                aria-label={interpolate(copy.typingAria, { agent: agent.name })}
              >
                <span className="typing-avatar" aria-hidden="true">
                  {agent.logo ? (
                    <img className="agent-logo-image" src={agent.logo} alt="" />
                  ) : (
                    agent.icon
                  )}
                </span>
                <span className="typing-pill" aria-hidden="true">
                  <span className="typing-dot" style={{ animationDelay: '0ms' }} />
                  <span className="typing-dot" style={{ animationDelay: '160ms' }} />
                  <span className="typing-dot" style={{ animationDelay: '320ms' }} />
                </span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <footer className="composer-wrap">
        <form onSubmit={handleSubmit} className="composer-form">
          <div
            className={composerClasses}
          >
            <button
              type="button"
              className={`composer-icon-btn ${isDragActive ? 'is-drag-active' : ''}`}
              aria-label={copy.attachFileAria}
              onClick={handleAttachClick}
            >
              <svg width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="1.6"
                  d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
                />
              </svg>
            </button>

            <input
              ref={fileInputRef}
              type="file"
              className="composer-file-input"
              accept={ACCEPTED_FILES}
              onChange={handleFileChange}
              tabIndex={-1}
            />

            {selectedFile && (
              <span className="composer-inline-file" title={selectedFile.name}>
                <span className="composer-inline-file-name">{selectedFile.name}</span>
                <button
                  type="button"
                  className="composer-inline-file-remove"
                  onClick={clearAttachment}
                  aria-label={copy.removeAttachmentAria}
                >
                  <svg width="12" height="12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 6l12 12M18 6l-12 12" />
                  </svg>
                </button>
              </span>
            )}

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={interpolate(copy.messagePlaceholder, { agent: agent.name })}
              className="composer-input"
            />

            <button
              type="submit"
              className="composer-send-btn"
              disabled={!canSend}
              aria-label={copy.sendMessageAria}
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {uploadError && (
            <p className="composer-error" role="alert">
              {uploadError}
            </p>
          )}
        </form>
      </footer>
    </section>
  )
}
