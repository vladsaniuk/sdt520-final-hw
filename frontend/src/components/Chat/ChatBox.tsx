import React, { useState } from 'react'
import { MermaidViewer } from '../Diagram/MermaidViewer'
import { CodeSnippet } from '../Code/Snippet'
import { CostTable } from '../Cost/CostTable'

interface IaC {
  type: string
  content: string
}

interface CostBreakdown {
  service: string
  cost: number
  is_calculated: boolean
}

interface Costs {
  total: number
  breakdown: CostBreakdown[]
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  diagram?: string
  iac?: IaC[]
  costs?: Costs
}

export const ChatBox: React.FC = () => {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)

  const handleSend = async () => {
    if (!input.trim()) return

    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      })
      const data = await response.json()

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.text,
        diagram: data.diagram,
        iac: data.iac,
        costs: data.costs,
      }
      setMessages((prev) => [...prev, assistantMessage])
    } catch (error) {
      console.error('Error sending message:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-screen bg-gray-100 p-4">
      <div className="flex-1 overflow-y-auto space-y-4 mb-4">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`p-3 rounded-lg max-w-4xl ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white self-end ml-auto'
                : 'bg-white text-gray-800 self-start shadow'
            }`}
          >
            <div className="prose prose-sm max-w-none">
              <p className="whitespace-pre-wrap">{msg.content}</p>
            </div>
            {msg.costs && msg.costs.breakdown.length > 0 && (
              <div className="mt-6">
                <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">Estimated Monthly Cost</p>
                <CostTable total={msg.costs.total} breakdown={msg.costs.breakdown} />
              </div>
            )}
            {msg.diagram && (
              <div className="mt-6">
                <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">Architecture Diagram</p>
                <MermaidViewer definition={msg.diagram} />
              </div>
            )}
            {msg.iac && msg.iac.length > 0 && (
              <div className="mt-6 space-y-4">
                <p className="text-xs text-gray-400 mb-2 font-bold uppercase tracking-wider">Infrastructure-as-Code</p>
                {msg.iac.map((snippet, j) => (
                  <CodeSnippet 
                    key={j} 
                    code={snippet.content} 
                    language={snippet.type === 'terraform' ? 'hcl' : 'yaml'} 
                  />
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && <div className="text-gray-400 italic">Advisor is thinking...</div>}
      </div>
      <div className="flex space-x-2 max-w-4xl mx-auto w-full">
        <input
          type="text"
          className="flex-1 p-3 border rounded shadow-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
          placeholder="Describe your AWS workload..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
        />
        <button
          className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 transition-colors disabled:bg-blue-300"
          onClick={handleSend}
          disabled={loading}
        >
          Send
        </button>
      </div>
    </div>
  )
}
