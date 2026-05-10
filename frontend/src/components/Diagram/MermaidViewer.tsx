import React, { useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { Box, HStack, Text, Icon } from '@chakra-ui/react'
import { MdGridView } from 'react-icons/md'

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
      // Use textContent (not innerHTML) so Mermaid source is not HTML-parsed.
      // HTML special chars like --> and > in arrows would otherwise be corrupted.
      containerRef.current.textContent = definition
      mermaid.run({ nodes: [containerRef.current] }).catch(() => {
        if (containerRef.current) {
          containerRef.current.textContent = '⚠ Could not render diagram — invalid Mermaid syntax'
        }
      })
    }
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
