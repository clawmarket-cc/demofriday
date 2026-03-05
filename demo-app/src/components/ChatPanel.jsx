import { useState, useRef, useEffect } from 'react'
import MessageBubble from './MessageBubble'

export default function ChatPanel({ agent, messages, onSend }) {
  const [input, setInput] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    inputRef.current?.focus()
  }, [agent.id])

  useEffect(() => {
    const last = messages[messages.length - 1]
    setIsTyping(last?.role === 'user')
  }, [messages])

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!input.trim()) return
    onSend(input.trim())
    setInput('')
  }

  const hasUserMessages = messages.some((m) => m.role === 'user')

  return (
    <div
      className="flex-1 flex flex-col h-full min-w-0"
      style={{
        backgroundColor: '#FAFAF7',
        borderRadius: '16px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Chat header */}
      <div
        className="px-8 py-5 flex items-center gap-4 shrink-0"
        style={{
          borderBottom: '1px solid #E8E3DA',
          backgroundColor: '#FAFAF7',
        }}
      >
        <div
          className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 font-bold text-[9px] tracking-wider"
          style={{
            backgroundColor: agent.color + '14',
            color: agent.color,
            border: `1px solid ${agent.color}25`,
          }}
        >
          {agent.icon}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold leading-tight" style={{ color: '#1A1A1A' }}>
            {agent.name}
          </h2>
          <p className="text-[12px] leading-tight mt-1 truncate" style={{ color: '#A09888' }}>
            {agent.description}
          </p>
        </div>
        <div
          className="flex items-center gap-2 px-3.5 py-2 rounded-full shrink-0"
          style={{
            backgroundColor: agent.color + '10',
            border: `1px solid ${agent.color}20`,
          }}
        >
          <div
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor: agent.color,
              boxShadow: `0 0 4px ${agent.color}60`,
            }}
          />
          <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: agent.color }}>
            Online
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div
        className="flex-1 overflow-y-auto min-h-0"
        style={{ backgroundColor: '#F5F1EA' }}
      >
        {!hasUserMessages ? (
          /* Empty state — agent intro card */
          <div className="h-full flex items-center justify-center px-8">
            <div className="text-center max-w-md">
              <div
                className="w-16 h-16 rounded-3xl flex items-center justify-center mx-auto font-bold text-sm tracking-wider"
                style={{
                  backgroundColor: agent.color + '14',
                  color: agent.color,
                  border: `1px solid ${agent.color}25`,
                }}
              >
                {agent.icon}
              </div>
              <h3
                className="text-lg font-bold mt-5 font-display"
                style={{ color: '#1A1A1A' }}
              >
                {agent.name}
              </h3>
              <p className="text-sm leading-relaxed mt-3" style={{ color: '#8B7D6B' }}>
                {agent.description}
              </p>
              <div
                className="mt-6 rounded-2xl px-6 py-4 text-left"
                style={{
                  backgroundColor: '#FFFFFF',
                  border: '1px solid #E8E3DA',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                }}
              >
                <p className="text-[13px] leading-relaxed" style={{ color: '#3D3D3D' }}>
                  {agent.greeting}
                </p>
              </div>
              <p className="text-[11px] mt-4" style={{ color: '#B0A898' }}>
                Type a message below to get started
              </p>
            </div>
          </div>
        ) : (
          /* Messages list */
          <div className="px-8 py-6">
            <div className="max-w-2xl mx-auto space-y-5">
              {messages.map((msg) => (
                <MessageBubble key={msg.id} message={msg} agent={agent} />
              ))}

              {isTyping && (
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center text-[7px] font-bold tracking-wider shrink-0"
                    style={{
                      backgroundColor: agent.color + '14',
                      color: agent.color,
                    }}
                  >
                    {agent.icon}
                  </div>
                  <div
                    className="rounded-2xl rounded-tl-md px-5 py-3.5"
                    style={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E8E3DA',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                    }}
                  >
                    <div className="flex gap-1.5 items-center h-4">
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#C9A96E', animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#C9A96E', animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ backgroundColor: '#C9A96E', animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Input area */}
      <div
        className="px-8 py-5 shrink-0"
        style={{
          borderTop: '1px solid #E8E3DA',
          backgroundColor: '#FAFAF7',
          boxShadow: '0 -2px 8px rgba(0,0,0,0.03)',
        }}
      >
        <form onSubmit={handleSubmit} className="max-w-2xl mx-auto">
          <div
            className="flex items-center gap-2 rounded-2xl px-2 py-1.5"
            style={{
              backgroundColor: '#FFFFFF',
              border: '1px solid #E0D8CB',
              boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            }}
          >
            {/* Attachment icon */}
            <button
              type="button"
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 cursor-pointer"
              style={{ transition: 'all 150ms ease' }}
              onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#F5F1EA' }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
            >
              <svg className="w-[18px] h-[18px]" style={{ color: '#B0A898' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            </button>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Message ${agent.name}...`}
              className="flex-1 bg-transparent text-[14px] outline-none py-2.5 min-w-0"
              style={{ color: '#1A1A1A' }}
            />

            {/* Send button */}
            <button
              type="submit"
              disabled={!input.trim()}
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-20 cursor-pointer"
              style={{
                transition: 'all 150ms ease',
                background: input.trim()
                  ? 'linear-gradient(135deg, #C9A96E, #B8944F)'
                  : '#EDE8DF',
                boxShadow: input.trim()
                  ? '0 2px 8px rgba(201, 169, 110, 0.35)'
                  : 'none',
              }}
            >
              <svg
                className="w-4 h-4"
                style={{ color: input.trim() ? '#fff' : '#B0A898' }}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
          <p className="text-center text-[10px] mt-3" style={{ color: '#D0C8BA' }}>
            AI-powered by GolemForce · Responses are simulated for demo
          </p>
        </form>
      </div>
    </div>
  )
}
