const renderInline = (text) => {
  const parts = text.split(/(\*\*.*?\*\*)/g)

  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className="rich-strong">
          {part.slice(2, -2)}
        </strong>
      )
    }

    return part
  })
}

const renderText = (text) => {
  const parts = text.split(/(```[\s\S]*?```|\*\*.*?\*\*|\|.*\|)/g)

  return parts.map((part, partIndex) => {
    if (part.startsWith('```') && part.endsWith('```')) {
      const code = part.slice(3, -3).replace(/^\w*\n/, '')

      return (
        <pre key={partIndex} className="rich-code">
          {code}
        </pre>
      )
    }

    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={partIndex} className="rich-strong">
          {part.slice(2, -2)}
        </strong>
      )
    }

    if (part.startsWith('|') && part.endsWith('|')) {
      const rows = part
        .split('\n')
        .filter((row) => row.trim() && !row.match(/^\|[-\s|]+\|$/))

      if (rows.length > 0) {
        return (
          <div key={partIndex} className="rich-table-wrap">
            <table className="rich-table">
              <tbody>
                {rows.map((row, rowIndex) => {
                  const cells = row
                    .split('|')
                    .filter(Boolean)
                    .map((cell) => cell.trim())

                  return (
                    <tr key={rowIndex}>
                      {cells.map((cell, cellIndex) => (
                        <td key={cellIndex}>{cell}</td>
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

    const lines = part.split('\n')

    return lines.map((line, lineIndex) => {
      if (line.startsWith('- ')) {
        return (
          <div key={`${partIndex}-${lineIndex}`} className="rich-list-row">
            <span className="rich-list-marker">&#8226;</span>
            <span>{renderInline(line.slice(2))}</span>
          </div>
        )
      }

      if (/^\d+\.\s/.test(line)) {
        const number = line.match(/^(\d+)\./)[1]

        return (
          <div key={`${partIndex}-${lineIndex}`} className="rich-list-row">
            <span className="rich-list-marker">{number}.</span>
            <span>{renderInline(line.replace(/^\d+\.\s/, ''))}</span>
          </div>
        )
      }

      return (
        <span key={`${partIndex}-${lineIndex}`}>
          {renderInline(line)}
          {lineIndex < lines.length - 1 && <br />}
        </span>
      )
    })
  })
}

export default function MessageBubble({ message, agent }) {
  const isUser = message.role === 'user'
  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (isUser) {
    return (
      <div className="message-row is-user">
        <div className="message-stack">
          <div className="message-bubble user-bubble">{message.text}</div>
          <p className="message-time align-end">{time}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="message-row">
      <span
        className="assistant-avatar"
        style={{
          '--agent-color': agent.color,
          '--agent-tint': `${agent.color}20`,
          '--agent-border': `${agent.color}66`,
        }}
        aria-hidden="true"
      >
        {agent.icon}
      </span>

      <div className="message-stack">
        <div className="message-bubble assistant-bubble">{renderText(message.text)}</div>
        <p className="message-time">{time}</p>
      </div>
    </div>
  )
}
