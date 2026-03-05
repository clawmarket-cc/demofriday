import { useState } from 'react'
import Sidebar from './components/Sidebar'
import ChatPanel from './components/ChatPanel'

const agents = [
  {
    id: 'excel',
    name: 'Excel Agent',
    description: 'Analyze spreadsheets, generate reports, transform data',
    color: '#22c55e',
    icon: 'XLS',
    status: 'online',
    greeting: "Hey! I'm your Excel Agent. I can help you analyze spreadsheets, generate pivot tables, clean data, create formulas, and build reports. Drop a file or tell me what you need.",
  },
  {
    id: 'pdf',
    name: 'PDF Agent',
    description: 'Extract data, summarize documents, answer questions',
    color: '#ef4444',
    icon: 'PDF',
    status: 'online',
    greeting: "Hi there! I'm your PDF Agent. I can extract information from PDFs, summarize documents, answer questions about contracts, and pull structured data from any document. What can I help with?",
  },
]

const mockResponses = {
  excel: [
    "I've analyzed the spreadsheet. Here's what I found:\n\n**Summary:**\n- 1,247 rows of transaction data\n- 3 columns with missing values\n- Revenue trend is up 12% QoQ\n\nWould you like me to generate a detailed report or create a pivot table?",
    "Done! I've created a pivot table breaking down revenue by region and quarter. The DACH region shows the strongest growth at 18.3%. Want me to export this as a new sheet?",
    "I've cleaned the dataset — removed 23 duplicate rows and filled in 47 missing values using interpolation. The data is ready for analysis. What would you like to explore next?",
    "Here's the formula you need:\n\n```\n=VLOOKUP(A2, Sheet2!$A:$D, 3, FALSE)\n```\n\nThis will pull the matching value from column C of Sheet2. Want me to apply it across all rows?",
  ],
  pdf: [
    "I've scanned through the document. Here's a quick summary:\n\n**Contract Overview:**\n- Type: Commercial Lease Agreement\n- Duration: 36 months\n- Monthly rent: EUR 4,500\n- Break clause: After 12 months with 3-month notice\n\nWant me to flag any unusual clauses?",
    "I found 3 clauses that need attention:\n\n1. **Section 4.2** — Automatic renewal without explicit opt-out\n2. **Section 7.1** — Tenant liable for structural repairs (unusual)\n3. **Section 9.3** — Non-compete radius of 15km (quite broad)\n\nShall I draft a summary for your legal team?",
    "Extracted all property details from the listing PDF:\n\n| Field | Value |\n|-------|-------|\n| Address | Favoritenstrasse 224, 1100 Wien |\n| Size | 185 m2 |\n| Rooms | 6 |\n| Year built | 2019 |\n| Energy class | A+ |\n\nWant me to compare this with similar listings?",
    "I've compiled the key financial figures from the annual report:\n\n- **Revenue:** EUR 2.3M (+15% YoY)\n- **EBITDA:** EUR 420K\n- **Net margin:** 18.2%\n\nThe document also mentions planned expansion into the German market in Q3. Want me to dig deeper into any section?",
  ],
}

export default function App() {
  const [activeAgent, setActiveAgent] = useState(agents[0])
  const [conversations, setConversations] = useState(() => {
    const initial = {}
    agents.forEach((agent) => {
      initial[agent.id] = [
        { id: 0, role: 'assistant', text: agent.greeting, timestamp: new Date() },
      ]
    })
    return initial
  })
  const [responseCounters, setResponseCounters] = useState({ excel: 0, pdf: 0 })

  const handleSend = (text) => {
    const userMsg = {
      id: Date.now(),
      role: 'user',
      text,
      timestamp: new Date(),
    }

    setConversations((prev) => ({
      ...prev,
      [activeAgent.id]: [...prev[activeAgent.id], userMsg],
    }))

    setTimeout(() => {
      const agentId = activeAgent.id
      const responses = mockResponses[agentId]
      const idx = responseCounters[agentId] % responses.length

      const botMsg = {
        id: Date.now() + 1,
        role: 'assistant',
        text: responses[idx],
        timestamp: new Date(),
      }

      setConversations((prev) => ({
        ...prev,
        [agentId]: [...prev[agentId], botMsg],
      }))

      setResponseCounters((prev) => ({
        ...prev,
        [agentId]: prev[agentId] + 1,
      }))
    }, 800 + Math.random() * 1200)
  }

  return (
    <div className="app-shell">
      <main className="workspace-grid" aria-label="Agent workspace">
        <Sidebar
          agents={agents}
          activeAgent={activeAgent}
          onSelect={setActiveAgent}
          conversations={conversations}
        />
        <ChatPanel
          agent={activeAgent}
          messages={conversations[activeAgent.id]}
          onSend={handleSend}
        />
      </main>
    </div>
  )
}
