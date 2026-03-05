export default function MessageBubble({ message, agent }) {
  const isUser = message.role === 'user'
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  const renderText = (text) => {
    const parts = text.split(/(```[\s\S]*?```|\*\*.*?\*\*|\|.*\|)/g)
    return parts.map((part, i) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const code = part.slice(3, -3).replace(/^\w*\n/, '')
        return (
          <pre
            key={i}
            className="rounded-xl p-4 my-3 text-xs font-mono overflow-x-auto"
            style={{
              backgroundColor: '#1A1A1A',
              color: '#4ade80',
            }}
          >
            {code}
          </pre>
        )
      }
      if (part.startsWith('**') && part.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold" style={{ color: '#1A1A1A' }}>
            {part.slice(2, -2)}
          </strong>
        )
      }
      if (part.startsWith('|') && part.endsWith('|')) {
        const rows = part.split('\n').filter((r) => r.trim() && !r.match(/^\|[-\s|]+\|$/))
        if (rows.length > 0) {
          return (
            <div key={i} className="my-3 overflow-x-auto rounded-xl" style={{ border: '1px solid #E8E3DA' }}>
              <table className="text-xs w-full" style={{ borderCollapse: 'collapse' }}>
                <tbody>
                  {rows.map((row, ri) => {
                    const cells = row.split('|').filter(Boolean).map((c) => c.trim())
                    return (
                      <tr key={ri} style={{ backgroundColor: ri === 0 ? '#F5F1EA' : 'transparent' }}>
                        {cells.map((cell, ci) => (
                          <td
                            key={ci}
                            className="py-2.5 px-4"
                            style={{
                              borderBottom: ri < rows.length - 1 ? '1px solid #E8E3DA' : 'none',
                              color: ri === 0 ? '#8B7D6B' : '#1A1A1A',
                              fontWeight: ri === 0 ? '600' : '400',
                              fontSize: ri === 0 ? '10px' : '12px',
                              textTransform: ri === 0 ? 'uppercase' : 'none',
                              letterSpacing: ri === 0 ? '0.05em' : 'normal',
                            }}
                          >
                            {cell}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      }
      return part.split('\n').map((line, li) => {
        if (line.startsWith('- ')) {
          return (
            <div key={`${i}-${li}`} className="flex gap-2.5 ml-0.5 py-0.5">
              <span className="shrink-0" style={{ color: '#C9A96E' }}>&#8226;</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          )
        }
        if (line.match(/^\d+\.\s/)) {
          const num = line.match(/^(\d+)\./)[1]
          return (
            <div key={`${i}-${li}`} className="flex gap-2.5 ml-0.5 py-0.5">
              <span className="shrink-0 font-semibold" style={{ color: '#C9A96E' }}>{num}.</span>
              <span>{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
            </div>
          )
        }
        return (
          <span key={`${i}-${li}`}>
            {renderInline(line)}
            {li < part.split('\n').length - 1 && <br />}
          </span>
        )
      })
    })
  }

  const renderInline = (text) => {
    const parts = text.split(/(\*\*.*?\*\*)/g)
    return parts.map((p, i) => {
      if (p.startsWith('**') && p.endsWith('**')) {
        return (
          <strong key={i} className="font-semibold" style={{ color: '#1A1A1A' }}>
            {p.slice(2, -2)}
          </strong>
        )
      }
      return p
    })
  }

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[65%]">
          <div
            className="rounded-2xl rounded-br-md px-5 py-3.5 text-[14px] leading-relaxed"
            style={{
              backgroundColor: '#C9A96E',
              color: '#FFFFFF',
              boxShadow: '0 1px 3px rgba(201, 169, 110, 0.3)',
            }}
          >
            {message.text}
          </div>
          <p className="text-[10px] mt-2 text-right" style={{ color: '#C5BBAD' }}>{time}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3.5">
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center text-[7px] font-bold tracking-wider shrink-0 mt-1"
        style={{
          backgroundColor: agent.color + '14',
          color: agent.color,
        }}
      >
        {agent.icon}
      </div>
      <div className="max-w-[75%] min-w-0">
        <div
          className="rounded-2xl rounded-tl-md px-5 py-4 text-[14px] leading-relaxed"
          style={{
            backgroundColor: '#FFFFFF',
            border: '1px solid #E8E3DA',
            color: '#3D3D3D',
            boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
          }}
        >
          {renderText(message.text)}
        </div>
        <p className="text-[10px] mt-2" style={{ color: '#C5BBAD' }}>{time}</p>
      </div>
    </div>
  )
}
