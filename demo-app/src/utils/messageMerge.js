const buildFileSignature = (file) => {
  if (!file) {
    return ''
  }

  return file.id || file.downloadUrl || `${file.name}-${file.size}-${file.type}`
}

const buildArtifactsSignature = (artifacts = []) =>
  artifacts.map((artifact) => buildFileSignature(artifact)).filter(Boolean).join(',')

export const buildMessageExactSignature = (message) =>
  `${message?.role ?? ''}|${message?.timestamp ?? ''}|${message?.text ?? ''}|${buildFileSignature(message?.file)}|${buildArtifactsSignature(message?.artifacts)}`

export const buildMessageLooseSignature = (message) => {
  const role = message?.role ?? ''
  const text = message?.text ?? ''

  if (typeof text === 'string' && text.trim()) {
    return `${role}|${text}`
  }

  return `${role}|${text}|${buildFileSignature(message?.file)}|${buildArtifactsSignature(message?.artifacts)}`
}

export const appendMissingConversationMessages = (primaryMessages = [], secondaryMessages = []) => {
  const nextMessages = [...primaryMessages]
  const seenExactSignatures = new Set(nextMessages.map((message) => buildMessageExactSignature(message)))
  const looseMatchBudget = new Map()
  const consumedLooseMatches = new Map()

  nextMessages.forEach((message) => {
    const looseSignature = buildMessageLooseSignature(message)
    looseMatchBudget.set(looseSignature, (looseMatchBudget.get(looseSignature) ?? 0) + 1)
  })

  const consumeLooseMatch = (looseSignature) => {
    const consumed = consumedLooseMatches.get(looseSignature) ?? 0
    const budget = looseMatchBudget.get(looseSignature) ?? 0

    if (consumed < budget) {
      consumedLooseMatches.set(looseSignature, consumed + 1)
      return true
    }

    return false
  }

  secondaryMessages.forEach((message) => {
    const exactSignature = buildMessageExactSignature(message)
    const looseSignature = buildMessageLooseSignature(message)

    if (seenExactSignatures.has(exactSignature)) {
      consumeLooseMatch(looseSignature)
      return
    }

    if (consumeLooseMatch(looseSignature)) {
      return
    }

    seenExactSignatures.add(exactSignature)
    looseMatchBudget.set(looseSignature, (looseMatchBudget.get(looseSignature) ?? 0) + 1)
    nextMessages.push(message)
  })

  return nextMessages
}
