const getStatusMeta = (status, statusLabels) => {
  if (status === 'online') return { color: '#22c55e', label: statusLabels.online }
  if (status === 'busy') return { color: '#eab308', label: statusLabels.busy }
  return { color: '#ef4444', label: statusLabels.offline }
}

const formatTemplate = (template, values) =>
  (typeof template === 'string' ? template : '').replace(/\{(\w+)\}/g, (_, key) => values[key] ?? '')

export default function Sidebar({
  agents,
  activeAgentId,
  onSelect,
  conversations,
  language,
  languageOrder,
  languageCodes,
  onLanguageChange,
  text,
  statusLabels,
}) {
  const uploadedFileTemplate = text.uploadedFile ?? 'Uploaded {name}'

  return (
    <aside className="panel sidebar-panel" aria-label={text.ariaLabel}>
      <header className="sidebar-header">
        <div className="brand-lockup">
          <div className="brand-glyph" aria-hidden="true">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <div>
            <p className="brand-title">GolemForce</p>
            <p className="brand-subtitle">{text.brandSubtitle}</p>
          </div>
        </div>
      </header>

      <div className="sidebar-toolbar">
        <span className="sidebar-label">{text.activeAgents}</span>
      </div>

      <nav className="agent-list" aria-label={text.availableAgentsAria}>
        {agents.map((agent) => {
          const isActive = activeAgentId === agent.id
          const lastMsg = conversations[agent.id]?.slice(-1)[0]
          const { color: statusColor, label: statusLabel } = getStatusMeta(agent.status, statusLabels)
          const isResponding = agent.status === 'busy' && lastMsg?.role === 'user'
          const lastSnippet =
            lastMsg?.text ||
            (lastMsg?.file
              ? formatTemplate(uploadedFileTemplate, { name: lastMsg.file.name })
              : text.noMessagesYet)

          return (
            <button
              key={agent.id}
              type="button"
              className={`agent-card ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelect(agent.id)}
              style={{
                '--agent-color': agent.color,
                '--agent-tint': `${agent.color}1c`,
                '--agent-border': `${agent.color}66`,
                '--status-color': statusColor,
              }}
              aria-pressed={isActive}
            >
              <span className="agent-icon-wrap" aria-hidden="true">
                <span className="agent-icon">
                  {agent.logo ? (
                    <img className="agent-logo-image" src={agent.logo} alt="" />
                  ) : (
                    agent.icon
                  )}
                </span>
                <span className="agent-presence" />
              </span>

              <span className="agent-copy">
                <span className="agent-title-row">
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-status-text">{statusLabel}</span>
                </span>
                <span className="agent-description">{agent.description}</span>
                {isResponding ? (
                  <span className="agent-snippet is-typing" aria-live="polite" aria-label={`${agent.name} ${statusLabel}`}>
                    <span className="typing-pill agent-typing-pill" aria-hidden="true">
                      <span className="typing-dot" style={{ animationDelay: '0ms' }} />
                      <span className="typing-dot" style={{ animationDelay: '160ms' }} />
                      <span className="typing-dot" style={{ animationDelay: '320ms' }} />
                    </span>
                  </span>
                ) : (
                  <span className="agent-snippet">{lastSnippet}</span>
                )}
              </span>
            </button>
          )
        })}
      </nav>

      <footer className="sidebar-footer">
        <span className="sidebar-health">
          <span className="health-dot" aria-hidden="true" />
          <span>{text.secureTransport}</span>
        </span>
        <select
          className="language-select"
          value={language}
          onChange={(event) => onLanguageChange(event.target.value)}
          aria-label={text.languageSwitchAria}
        >
          {languageOrder.map((lang) => (
            <option key={lang} value={lang}>
              {languageCodes[lang]}
            </option>
          ))}
        </select>
      </footer>
    </aside>
  )
}
