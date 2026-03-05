import { useEffect, useRef, useState } from 'react'
import MessageBubble from './MessageBubble'

const getStatusMeta = (status) => {
  if (status === 'online') return { color: '#22c55e', label: 'Online' }
  if (status === 'busy') return { color: '#eab308', label: 'Busy' }
  return { color: '#ef4444', label: 'Offline' }
}

export default function ChatPanel({ agent, messages, onSend }) {
  const [input, setInput] = useState('')
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [agent.id])

  const handleSubmit = (event) => {
    event.preventDefault()
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  const hasUserMessages = messages.some((message) => message.role === 'user')
  const isTyping = messages[messages.length - 1]?.role === 'user'
  const { color: statusColor, label: statusLabel } = getStatusMeta(agent.status)

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
      aria-label={`${agent.name} conversation`}
    >
      <header className="chat-header">
        <div className="chat-agent-mark" aria-hidden="true">
          {agent.icon}
        </div>

        <div className="chat-agent-copy">
          <h2>{agent.name}</h2>
          <p>{agent.description}</p>
        </div>

        <span className="chat-status-pill">
          <span className="chat-status-dot" aria-hidden="true" />
          {statusLabel}
        </span>
      </header>

      <div className="chat-stream">
        {!hasUserMessages ? (
          <div className="chat-empty">
            <div className="empty-card">
              <span className="empty-chip">Ready to Assist</span>
              <h3 className="empty-title">Start with a clear task for {agent.name}</h3>
              <p className="empty-copy">{agent.greeting}</p>

              <div className="empty-hints" aria-hidden="true">
                <span className="empty-hint">Summarize this file</span>
                <span className="empty-hint">Find high-risk clauses</span>
                <span className="empty-hint">Build a quick report</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="chat-scroll-content">
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} agent={agent} />
            ))}

            {isTyping && (
              <div className="typing-row" aria-live="polite" aria-label={`${agent.name} is typing`}>
                <span className="typing-avatar" aria-hidden="true">
                  {agent.icon}
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
          <div className="composer-shell">
            <button type="button" className="composer-icon-btn" aria-label="Attach file">
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
              ref={inputRef}
              type="text"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder={`Message ${agent.name}...`}
              className="composer-input"
            />

            <button
              type="submit"
              className="composer-send-btn"
              disabled={!input.trim()}
              aria-label="Send message"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <p className="composer-footnote">GolemForce simulation environment for demo conversations</p>
        </form>
      </footer>
    </section>
  )
}
