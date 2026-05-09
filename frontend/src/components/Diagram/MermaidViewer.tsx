import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
  startOnLoad: true,
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
      mermaid.contentLoaded()
    }
  }, [definition])

  return (
    <div className="mermaid bg-white p-4 rounded border shadow-inner" ref={containerRef}>
      {definition}
    </div>
  )
}
