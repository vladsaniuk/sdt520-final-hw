import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
})

interface MermaidViewerProps {
  definition: string
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ definition }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (containerRef.current && definition) {
      containerRef.current.removeAttribute('data-processed')
      containerRef.current.innerHTML = definition
      mermaid.run({ nodes: [containerRef.current] })
    }
  }, [definition])

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm mt-3">
      {/* Header bar */}
      <div className="bg-aws-squid px-4 py-2 flex items-center gap-2">
        <svg
          className="w-4 h-4 text-aws-orange"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
          />
        </svg>
        <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">
          ARCHITECTURE DIAGRAM
        </span>
      </div>
      {/* Diagram area — containerRef stays here so mermaid.run() targets this element */}
      <div
        className="mermaid bg-white p-4 min-h-[200px]"
        ref={containerRef}
      />
    </div>
  )
}
