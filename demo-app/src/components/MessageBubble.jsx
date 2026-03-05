import { formatFileSize, getAttachmentLabel } from '../utils/filePreview'

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

const defaultMessageText = {
  previewArtifactLabel: 'Preview',
  downloadArtifactLabel: 'Download',
  generatedFileLabel: 'Generated file',
}

const Attachment = ({
  file,
  actionLabel = '',
  metaLabel = '',
  previewLabel = '',
  onPreview = null,
}) => (
  <div className={`message-file-card ${file.downloadUrl ? 'is-downloadable' : ''}`}>
    <span className="message-file-icon" aria-hidden="true">
      {getAttachmentLabel(file.name)}
    </span>
    <span className="message-file-copy">
      <span className="message-file-name" title={file.name}>
        {file.name}
      </span>
      <span className="message-file-meta">
        {file.size > 0 ? formatFileSize(file.size) : metaLabel}
      </span>
    </span>
    <span className="message-file-actions">
      {file.downloadUrl && typeof onPreview === 'function' ? (
        <button type="button" className="message-file-action is-secondary" onClick={() => onPreview(file)}>
          {previewLabel}
        </button>
      ) : null}
      {file.downloadUrl ? (
        <a
          className="message-file-action"
          href={file.downloadUrl}
          download
          target="_blank"
          rel="noreferrer"
        >
          {actionLabel}
        </a>
      ) : null}
    </span>
  </div>
)

export default function MessageBubble({
  message,
  agent,
  locale = 'en-US',
  text = defaultMessageText,
  onPreviewFile,
}) {
  const copy = { ...defaultMessageText, ...text }
  const isUser = message.role === 'user'
  const hasText = Boolean(message.text?.trim())
  const hasAttachment = Boolean(message.file)
  const artifacts = Array.isArray(message.artifacts) ? message.artifacts.filter(Boolean) : []
  const time = new Date(message.timestamp).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
  })

  if (isUser) {
    return (
      <div className="message-row is-user">
        <div className="message-stack">
          <div className="message-bubble user-bubble">
            {hasText && <span>{message.text}</span>}
            {hasAttachment && (
              <Attachment
                file={{
                  ...message.file,
                  source: 'upload',
                }}
                previewLabel={copy.previewArtifactLabel}
                actionLabel={copy.downloadArtifactLabel}
                metaLabel={copy.generatedFileLabel}
                onPreview={onPreviewFile}
              />
            )}
          </div>
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
        {agent.logo ? (
          <img className="agent-logo-image" src={agent.logo} alt="" />
        ) : (
          agent.icon
        )}
      </span>

      <div className="message-stack">
        <div className="message-bubble assistant-bubble">
          {hasText && renderText(message.text)}
          {hasAttachment && (
            <Attachment
              file={{
                ...message.file,
                source: 'artifact',
              }}
              previewLabel={copy.previewArtifactLabel}
              actionLabel={copy.downloadArtifactLabel}
              metaLabel={copy.generatedFileLabel}
              onPreview={onPreviewFile}
            />
          )}
          {artifacts.length > 0 && (
            <div className="message-artifact-list">
              {artifacts.map((artifact, index) => (
                <Attachment
                  key={artifact.id ?? artifact.downloadUrl ?? `${message.id}-artifact-${index}`}
                  file={{
                    ...artifact,
                    name: artifact.name || copy.generatedFileLabel,
                    source: 'artifact',
                  }}
                  previewLabel={copy.previewArtifactLabel}
                  actionLabel={copy.downloadArtifactLabel}
                  metaLabel={copy.generatedFileLabel}
                  onPreview={onPreviewFile}
                />
              ))}
            </div>
          )}
        </div>
        <p className="message-time">{time}</p>
      </div>
    </div>
  )
}
