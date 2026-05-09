import { useState } from 'react'
import { ChatBox } from './components/Chat/ChatBox'
import { KnowledgeBase } from './pages/KnowledgeBase'

type Page = 'chat' | 'knowledge'

interface MockConversation {
  id: string
  title: string
  preview: string
  time: string
}

const MOCK_CONVERSATIONS: MockConversation[] = [
  { id: 'c1', title: 'Serverless e-commerce API', preview: 'Lambda + API Gateway + DynamoDB...', time: '2m ago' },
  { id: 'c2', title: 'Multi-region DR setup', preview: 'Route 53 failover with RDS Multi-AZ...', time: '1h ago' },
  { id: 'c3', title: 'ML inference pipeline', preview: 'SageMaker + S3 + Step Functions...', time: 'Yesterday' },
  { id: 'c4', title: 'Event-driven microservices', preview: 'SNS + SQS + ECS Fargate...', time: '2d ago' },
]

function App() {
  const [page, setPage] = useState<Page>('chat')
  const [activeConv, setActiveConv] = useState('c1')

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside className="w-64 flex flex-col bg-aws-squid text-gray-100 shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-2 px-4 py-4 border-b border-aws-squid-light">
          <div className="w-7 h-7 rounded bg-aws-orange flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-aws-squid" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div>
            <p className="text-xs font-bold text-white leading-none">AWS</p>
            <p className="text-[10px] text-gray-400 leading-none">Architecture Advisor</p>
          </div>
        </div>

        {/* New chat button */}
        <div className="px-3 pt-3">
          <button
            onClick={() => setPage('chat')}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-md border border-aws-squid-light text-sm text-gray-300 hover:bg-aws-squid-light transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New conversation
          </button>
        </div>

        {/* Conversations — mocked (Phase 3 will wire real history) */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Recent</p>
          {MOCK_CONVERSATIONS.map((c) => (
            <button
              key={c.id}
              onClick={() => { setActiveConv(c.id); setPage('chat') }}
              className={`w-full text-left px-3 py-2 rounded-md transition-colors group ${
                activeConv === c.id ? 'bg-aws-squid-light' : 'hover:bg-aws-squid-light/60'
              }`}
            >
              <p className="text-sm text-gray-200 font-medium truncate">{c.title}</p>
              <p className="text-[11px] text-gray-500 truncate">{c.preview}</p>
              <p className="text-[10px] text-gray-600 mt-0.5">{c.time}</p>
            </button>
          ))}
          {/* Coming-soon hint */}
          <p className="px-2 pt-3 text-[10px] text-gray-600 italic">
            Full history available in Phase 3
          </p>
        </div>

        {/* Nav footer */}
        <div className="border-t border-aws-squid-light p-2 space-y-0.5">
          <button
            onClick={() => setPage('knowledge')}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${
              page === 'knowledge' ? 'bg-aws-orange text-aws-squid font-medium' : 'text-gray-300 hover:bg-aws-squid-light'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Knowledge Base
          </button>
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top bar */}
        <header className="h-12 bg-white border-b flex items-center justify-between px-4 shrink-0 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="text-gray-400">▸</span>
            <span className="font-medium text-gray-800">{page === 'chat' ? 'Advisor' : 'Knowledge Base'}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            Connected to Neo4j
          </div>
        </header>

        <main className="flex-1 overflow-hidden">
          {page === 'chat' ? <ChatBox /> : <KnowledgeBase />}
        </main>
      </div>
    </div>
  )
}

export default App

