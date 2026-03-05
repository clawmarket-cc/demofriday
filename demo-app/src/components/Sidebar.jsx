export default function Sidebar({ agents, activeAgent, onSelect, conversations }) {
  return (
    <div
      className="w-80 flex flex-col h-full shrink-0"
      style={{
        backgroundColor: '#FAFAF7',
        borderRadius: '16px',
        marginRight: '12px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.04)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div className="px-6 pt-6 pb-5" style={{ borderBottom: '1px solid #E8E3DA' }}>
        <h1
          className="text-xl font-bold font-display"
          style={{ color: '#1A1A1A', letterSpacing: '-0.01em' }}
        >
          GolemForce
        </h1>
        <p
          className="text-[11px] mt-1.5 font-medium uppercase tracking-widest"
          style={{ color: '#C9A96E' }}
        >
          Agentic OS
        </p>
      </div>

      {/* Agent list */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-4 min-h-0">
        <p
          className="text-[10px] uppercase tracking-widest font-semibold px-3 mb-4"
          style={{ color: '#B0A898' }}
        >
          Your Agents
        </p>

        <div className="space-y-2">
          {agents.map((agent) => {
            const isActive = activeAgent.id === agent.id
            const lastMsg = conversations[agent.id]?.slice(-1)[0]
            return (
              <button
                key={agent.id}
                onClick={() => onSelect(agent)}
                className="w-full flex items-center gap-4 px-4 py-3.5 rounded-2xl text-left cursor-pointer"
                style={{
                  transition: 'all 150ms ease',
                  backgroundColor: isActive ? '#F0EBE2' : 'transparent',
                  border: isActive ? '1px solid #E0D8CB' : '1px solid transparent',
                  boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.04)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = '#F5F2EC'
                }}
                onMouseLeave={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = 'transparent'
                }}
              >
                <div
                  className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-bold text-[10px] tracking-wider"
                  style={{
                    backgroundColor: agent.color + '14',
                    color: agent.color,
                    border: `1px solid ${agent.color}25`,
                  }}
                >
                  {agent.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[13px] font-semibold" style={{ color: '#1A1A1A' }}>
                      {agent.name}
                    </span>
                    <div
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{
                        backgroundColor: agent.color,
                        boxShadow: `0 0 6px ${agent.color}50`,
                      }}
                    />
                  </div>
                  <p className="text-[11px] truncate mt-1" style={{ color: '#A09888' }}>
                    {lastMsg?.text?.slice(0, 36)}...
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4" style={{ borderTop: '1px solid #E8E3DA' }}>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: '#B0A898' }}>
          <div
            className="w-1.5 h-1.5 rounded-full shrink-0"
            style={{ backgroundColor: '#22c55e', boxShadow: '0 0 4px rgba(34,197,94,0.5)' }}
          />
          <span>Powered by OpenClaw</span>
        </div>
      </div>
    </div>
  )
}
