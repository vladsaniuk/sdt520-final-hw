import React, { useState, useRef } from 'react'

interface ProgressState {
  status: string
  progress_pct: number
  message: string
}

export const KnowledgeBase: React.FC = () => {
  const [file, setFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Fallback polling when WebSocket is unavailable
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
    // Relative URL — Vite proxy handles the WS upgrade to ws://backend:8000
    const ws = new WebSocket(`/api/v1/knowledge/progress/${docId}`)

    ws.onmessage = (event) => {
      const data: ProgressState = JSON.parse(event.data)
      setProgress(data)
      if (data.status === 'indexed' || data.status === 'error') {
        ws.close()
      }
    }

    ws.onerror = () => {
      // WebSocket failed — fall back to polling
      ws.close()
      startPolling(docId)
    }
  }

  const handleUpload = async () => {
    if (!file) return

    setUploading(true)
    setProgress({ status: 'pending', progress_pct: 0, message: 'Uploading...' })

    const formData = new FormData()
    formData.append('file', file)

    try {
      const response = await fetch('/api/v1/knowledge/upload', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        throw new Error(`Upload failed: ${response.status}`)
      }

      const data = await response.json()
      // Open WebSocket to stream progress — backend pre-populates state so no events are missed
      openProgressWebSocket(data.document_id)
    } catch (error) {
      setProgress({ status: 'error', progress_pct: 0, message: `Upload failed: ${String(error)}` })
    } finally {
      setUploading(false)
    }
  }

  const progressColor =
    progress?.status === 'indexed'
      ? 'bg-green-500'
      : progress?.status === 'error'
        ? 'bg-red-500'
        : 'bg-blue-500'

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Knowledge Base Management</h2>
      <div className="bg-white p-6 rounded-lg border shadow-sm">
        <p className="mb-4 text-gray-600">
          Upload AWS Well-Architected Framework documentation to supplement the advisor's knowledge.
          Supported formats: PDF, Markdown (.md), Plain text (.txt)
        </p>
        <div className="flex items-center space-x-4">
          <input
            type="file"
            // Locked in CONTEXT.md: PDF, markdown, plain text
            accept=".pdf,.md,.markdown,.txt"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="border p-2 rounded"
            disabled={uploading}
          />
          <button
            onClick={handleUpload}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-green-300"
            disabled={!file || uploading}
          >
            {uploading ? 'Uploading...' : 'Upload & Index'}
          </button>
        </div>

        {progress && (
          <div className="mt-4">
            {/* Progress bar */}
            <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2">
              <div
                className={`h-2.5 rounded-full transition-all duration-300 ${progressColor}`}
                style={{ width: `${progress.progress_pct}%` }}
              />
            </div>
            <p className="text-sm font-medium text-gray-700">
              {progress.progress_pct}% — {progress.message}
            </p>
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
  )
}
