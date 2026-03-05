const messageHasText = (message) =>
  typeof message?.text === 'string' && message.text.trim().length > 0

const messageHasArtifacts = (message) =>
  Array.isArray(message?.artifacts) && message.artifacts.filter(Boolean).length > 0

export const assistantMessageHasVisibleOutput = (message) =>
  message?.role === 'assistant' && (messageHasText(message) || messageHasArtifacts(message))

export const hasVisibleAssistantResultAfterLatestUser = (messages = []) => {
  if (!Array.isArray(messages) || messages.length === 0) {
    return false
  }

  let latestUserIndex = -1

  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === 'user') {
      latestUserIndex = index
      break
    }
  }

  if (latestUserIndex === -1) {
    return messages.some(assistantMessageHasVisibleOutput)
  }

  return messages.slice(latestUserIndex + 1).some(assistantMessageHasVisibleOutput)
}

export const isAwaitingVisibleAgentResult = ({
  messages = [],
  isSending = false,
  runStatus = null,
} = {}) => {
  if (!isSending && !runStatus?.pending) {
    return false
  }

  return !hasVisibleAssistantResultAfterLatestUser(messages)
}
