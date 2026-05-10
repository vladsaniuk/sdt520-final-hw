import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { Box, HStack, Text, Icon } from '@chakra-ui/react'
import { MdGridView } from 'react-icons/md'

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
})

/**
 * Sanitize LLM-generated Mermaid syntax to avoid common parse errors.
 * LLMs frequently include parentheses inside square-bracket node labels
 * (e.g. [ECS Fargate (Containers)]) which breaks Mermaid's parser because
 * ( starts a shape definition. Strip them from inside [...] labels only.
 * Also strip double-quotes inside labels which can break string parsing.
 */
function sanitizeMermaid(definition: string): string {
  return definition
    // Remove ( ) inside square-bracket labels: [label (note)] → [label note]
    .replace(/\[([^\]]*)\]/g, (_match, inner: string) =>
      '[' + inner.replace(/[()]/g, '').trim() + ']'
    )
    // Replace double-quotes inside labels with single-quotes
    .replace(/\[([^\]]*)\]/g, (_match, inner: string) =>
      '[' + inner.replace(/"/g, "'") + ']'
    )
}

interface MermaidViewerProps {
  definition: string
}

export const MermaidViewer: React.FC<MermaidViewerProps> = ({ definition }) => {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current || !definition) return

    const el = containerRef.current
    const sanitized = sanitizeMermaid(definition)

    // Log so we can inspect the actual definition in devtools
    console.debug('[MermaidViewer] definition:', sanitized)

    // Use mermaid.render() (not mermaid.run()) for reliable v10 error handling.
    // render() returns a Promise<{svg}> and rejects on syntax errors.
    const id = `mermaid-diagram-${Date.now()}`
    mermaid.render(id, sanitized)
      .then(({ svg }) => {
        el.innerHTML = svg
      })
      .catch((err: unknown) => {
        console.error('[MermaidViewer] render failed:', err, '\nDefinition:', sanitized)
        el.textContent = '⚠ Could not render diagram — invalid Mermaid syntax'
      })
  }, [definition])

  return (
    <Box borderRadius="xl" overflow="hidden" border="1px solid" borderColor="gray.200" boxShadow="sm" mt={3}>
      <HStack px={4} py={2} bg="aws.squid" spacing={2}>
        <Icon as={MdGridView} color="aws.orange" boxSize={4} />
        <Text fontSize="xs" fontWeight="bold" color="gray.300" textTransform="uppercase" letterSpacing="widest">
          Architecture Diagram
        </Text>
      </HStack>
      {/* containerRef must stay on the inner .mermaid div — mermaid.run() targets this element */}
      <Box className="mermaid" bg="white" p={4} minH="200px" ref={containerRef} />
    </Box>
  )
}
