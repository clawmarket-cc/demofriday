import { agentDefinitions } from './agents'
import { translations } from './translations'

export const buildAgents = (language) => {
  const copy = translations[language] ?? translations.en

  return agentDefinitions.map((agent) => ({
    ...agent,
    name: copy.agents[agent.id].name,
    description: copy.agents[agent.id].description,
    greeting: copy.agents[agent.id].greeting,
  }))
}

export const getAssistantMessageText = (language, message) => {
  const copy = translations[language] ?? translations.en
  const agentCopy = copy.agents[message.agentId]

  if (!agentCopy) return ''
  if (message.kind === 'greeting') return agentCopy.greeting
  if (message.kind === 'response') return agentCopy.responses[message.responseIndex] ?? ''

  return ''
}
