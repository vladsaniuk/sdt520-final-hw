import { useState } from 'react'
import { ChatBox } from './components/Chat/ChatBox'
import { KnowledgeBase } from './pages/KnowledgeBase'

function App() {
  const [page, setPage] = useState<'chat' | 'knowledge'>('chat')

  return (
    <div className="App flex flex-col h-screen">
      <header className="bg-white shadow-sm p-4 border-b">
        <div className="max-w-6xl mx-auto flex justify-between items-center w-full">
          <h1 className="text-xl font-bold text-gray-900">AWS Architecture Advisor</h1>
          <nav className="space-x-4">
            <button 
              onClick={() => setPage('chat')}
              className={`px-3 py-1 rounded ${page === 'chat' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Advisor
            </button>
            <button 
              onClick={() => setPage('knowledge')}
              className={`px-3 py-1 rounded ${page === 'knowledge' ? 'bg-blue-100 text-blue-700 font-bold' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Knowledge Base
            </button>
          </nav>
        </div>
      </header>
      <main className="flex-1 overflow-hidden">
        {page === 'chat' ? <ChatBox /> : <KnowledgeBase />}
      </main>
    </div>
  )
}

export default App
