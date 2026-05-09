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
    <div
      className="mermaid bg-white p-4 rounded border shadow-inner"
      ref={containerRef}
    />
  )
}
