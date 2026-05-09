import React, { useState } from 'react'

export const KnowledgeBase: React.FC = () => {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<string>('')

  const handleUpload = async () => {
    if (!file) return

    const formData = new FormData()
    formData.append('file', file)

    setStatus('Uploading...')
    try {
      const response = await fetch('/api/v1/knowledge/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await response.json()
      setStatus(`Success! Document ID: ${data.document_id}. Indexing in progress...`)
    } catch (error) {
      setStatus('Upload failed.')
      console.error(error)
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Knowledge Base Management</h2>
      <div className="bg-white p-6 rounded-lg border shadow-sm">
        <p className="mb-4 text-gray-600">Upload AWS Well-Architected Framework documentation (PDF/Markdown) to supplement the advisor's knowledge.</p>
        <div className="flex items-center space-x-4">
          <input 
            type="file" 
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="border p-2 rounded"
          />
          <button 
            onClick={handleUpload}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:bg-green-300"
            disabled={!file}
          >
            Upload & Index
          </button>
        </div>
        {status && <p className="mt-4 text-sm font-medium text-blue-600">{status}</p>}
      </div>
    </div>
  )
}
