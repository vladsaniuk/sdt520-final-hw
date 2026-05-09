import React, { useState, useRef } from 'react'

interface ProgressState {
  status: string
  progress_pct: number
  message: string
}

const MOCK_INDEXED_DOCS = [
  { name: 'AWS-Well-Architected-Framework.pdf', size: '2.4 MB', chunks: 312, date: '2 days ago' },
  { name: 'aws-security-whitepaper.pdf', size: '1.1 MB', chunks: 148, date: '1 week ago' },
]

export const KnowledgeBase: React.FC = () => {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const startPolling = (docId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/knowledge/status/${docId}`)
        const data = await res.json()
        setProgress({ status: data.status, progress_pct: data.progress_pct ?? 0, message: data.message ?? '' })
        if (data.status === 'indexed' || data.status === 'error') {
          clearInterval(pollingRef.current!)
          pollingRef.current = null
        }
      } catch {
        // Ignore polling errors silently
      }
    }, 2000)
  }

  const openProgressWebSocket = (docId: string) => {
    const ws = new WebSocket(`/api/v1/knowledge/progress/${docId}`)
    ws.onmessage = (event) => {
      const data: ProgressState = JSON.parse(event.data)
      setProgress(data)
      if (data.status === 'indexed' || data.status === 'error') ws.close()
    }
    ws.onerror = () => {
      ws.close()
      startPolling(docId)
    }
  }

  const handleUpload = async () => {
    if (!file) return
    setUploading(true)
    setProgress({ status: 'pending', progress_pct: 0, message: 'Uploading…' })
    const formData = new FormData()
    formData.append('file', file)
    try {
      const response = await fetch('/api/v1/knowledge/upload', { method: 'POST', body: formData })
      if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
      const data = await response.json()
      openProgressWebSocket(data.document_id)
    } catch (error) {
      setProgress({ status: 'error', progress_pct: 0, message: `Upload failed: ${String(error)}` })
    } finally {
      setUploading(false)
    }
  }

  const progressColor =
    progress?.status === 'indexed' ? 'bg-green-500' : progress?.status === 'error' ? 'bg-red-500' : 'bg-aws-orange'

  return (
    <div className="h-full overflow-y-auto bg-gray-50 px-6 py-8">
      <div className="max-w-3xl mx-auto space-y-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Knowledge Base</h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload AWS documentation to ground the advisor's recommendations in your own sources.
          </p>
        </div>

        {/* Upload card */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
            <svg className="w-4 h-4 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Upload Document</span>
          </div>
          <div className="p-5">
            <label
              className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                file ? 'border-aws-orange bg-orange-50' : 'border-gray-300 bg-gray-50 hover:border-aws-orange hover:bg-orange-50/30'
              }`}
            >
              <svg className="w-8 h-8 text-gray-400 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {file ? (
                <p className="text-sm font-medium text-aws-orange">{file.name}</p>
              ) : (
                <>
                  <p className="text-sm text-gray-500">Click to select a file</p>
                  <p className="text-xs text-gray-400 mt-1">PDF, Markdown (.md), Plain text (.txt)</p>
                </>
              )}
              <input
                type="file"
                accept=".pdf,.md,.markdown,.txt"
                className="hidden"
                onChange={(e) => { setFile(e.target.files?.[0] || null); setProgress(null) }}
                disabled={uploading}
              />
            </label>

            <button
              onClick={handleUpload}
              disabled={!file || uploading}
              className="mt-4 w-full py-2.5 rounded-lg bg-aws-orange text-aws-squid font-semibold text-sm hover:bg-aws-orange-dark disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? 'Uploading…' : 'Upload & Index'}
            </button>

            {progress && (
              <div className="mt-4">
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span className="capitalize">{progress.status}</span>
                  <span>{progress.progress_pct}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${progressColor}`}
                    style={{ width: `${progress.progress_pct}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">{progress.message}</p>
                {progress.status === 'indexed' && (
                  <p className="mt-2 text-sm text-green-600 font-semibold">✓ Document indexed successfully</p>
                )}
                {progress.status === 'error' && (
                  <p className="mt-2 text-sm text-red-600 font-semibold">✗ {progress.message}</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Indexed documents — mock data for demo */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-5 py-3 border-b border-gray-100 bg-gray-50">
            <svg className="w-4 h-4 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
            <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">Indexed Documents</span>
            <span className="ml-auto text-xs text-gray-400 italic">sample data</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {MOCK_INDEXED_DOCS.map((doc) => (
              <li key={doc.name} className="flex items-center gap-4 px-5 py-3">
                <svg className="w-5 h-5 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 font-medium truncate">{doc.name}</p>
                  <p className="text-xs text-gray-400">{doc.size} · {doc.chunks} chunks · {doc.date}</p>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium shrink-0">Indexed</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

