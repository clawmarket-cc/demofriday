const getStatusMeta = (status) => {
  if (status === 'online') return { color: '#22c55e', label: 'Online' }
  if (status === 'busy') return { color: '#eab308', label: 'Busy' }
  return { color: '#ef4444', label: 'Offline' }
}

export default function Sidebar({ agents, activeAgent, onSelect, conversations }) {
  return (
    <aside className="panel sidebar-panel" aria-label="Agent list">
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
            <p className="brand-subtitle">Agentic Workspace</p>
          </div>
        </div>
      </header>

      <div className="sidebar-toolbar">
        <span className="sidebar-label">Active Agents</span>
        <span className="sidebar-count" aria-label={`${agents.length} agents`}>
          {agents.length}
        </span>
      </div>

      <nav className="agent-list" aria-label="Available agents">
        {agents.map((agent) => {
          const isActive = activeAgent.id === agent.id
          const lastMsg = conversations[agent.id]?.slice(-1)[0]
          const { color: statusColor, label: statusLabel } = getStatusMeta(agent.status)

          return (
            <button
              key={agent.id}
              type="button"
              className={`agent-card ${isActive ? 'is-active' : ''}`}
              onClick={() => onSelect(agent)}
              style={{
                '--agent-color': agent.color,
                '--agent-tint': `${agent.color}1c`,
                '--agent-border': `${agent.color}66`,
                '--status-color': statusColor,
              }}
              aria-pressed={isActive}
            >
              <span className="agent-icon-wrap" aria-hidden="true">
                <span className="agent-icon">{agent.icon}</span>
                <span className="agent-presence" />
              </span>

              <span className="agent-copy">
                <span className="agent-title-row">
                  <span className="agent-name">{agent.name}</span>
                  <span className="agent-status-text">{statusLabel}</span>
                </span>
                <span className="agent-description">{agent.description}</span>
                <span className="agent-snippet">{lastMsg?.text ?? 'No messages yet.'}</span>
              </span>
            </button>
          )
        })}
      </nav>

      <footer className="sidebar-footer">
        <span className="health-dot" aria-hidden="true" />
        <span>Secure transport active</span>
      </footer>
    </aside>
  )
}
