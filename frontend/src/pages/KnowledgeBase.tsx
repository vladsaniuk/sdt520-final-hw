import React, { useState, useRef } from 'react'
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Icon,
  Progress,
  Badge,
  Divider,
  Alert,
  AlertIcon,
} from '@chakra-ui/react'
import { MdUploadFile, MdFolder, MdDescription } from 'react-icons/md'

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
  const inputRef = useRef<HTMLInputElement>(null)

  const TERMINAL_STATUSES = new Set(['indexed', 'error', 'unknown'])

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const startPolling = (docId: string) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/knowledge/status/${docId}`)
        const data = await res.json()
        // 'unknown' = doc no longer in memory (already indexed/expired), stop polling
        if (data.status !== 'unknown') {
          setProgress({ status: data.status, progress_pct: data.progress_pct ?? 0, message: data.message ?? '' })
        }
        if (TERMINAL_STATUSES.has(data.status)) stopPolling()
      } catch {
        // Ignore polling errors silently
      }
    }, 2000)
  }

  const openProgressWebSocket = (docId: string) => {
    let receivedTerminal = false
    const ws = new WebSocket(`/api/v1/knowledge/progress/${docId}`)
    ws.onmessage = (event) => {
      const data: ProgressState = JSON.parse(event.data)
      setProgress(data)
      if (data.status === 'indexed' || data.status === 'error') {
        receivedTerminal = true
        ws.close()
      }
    }
    ws.onerror = () => {
      ws.close()
      // Only fall back to polling if we haven't already received a terminal status via WS
      if (!receivedTerminal) startPolling(docId)
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
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      openProgressWebSocket(data.document_id)
    } catch (error) {
      setProgress({ status: 'error', progress_pct: 0, message: `Upload failed: ${String(error)}` })
    } finally {
      setUploading(false)
    }
  }

  const progressColorScheme =
    progress?.status === 'indexed' ? 'green' : progress?.status === 'error' ? 'red' : 'orange'

  return (
    <Box h="full" overflowY="auto" bg="gray.50" px={6} py={8}>
      <VStack maxW="3xl" mx="auto" spacing={6} align="stretch">
        <Box>
          <Text fontSize="xl" fontWeight="bold" color="gray.900">Knowledge Base</Text>
          <Text fontSize="sm" color="gray.500" mt={1}>
            Upload AWS documentation to ground the advisor's recommendations in your own sources.
          </Text>
        </Box>

        {/* Upload card */}
        <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200" boxShadow="sm" overflow="hidden">
          <HStack px={5} py={3} borderBottom="1px solid" borderColor="gray.100" bg="gray.50" spacing={2}>
            <Icon as={MdUploadFile} color="aws.orange" boxSize={4} />
            <Text fontSize="xs" fontWeight="semibold" color="gray.600" textTransform="uppercase" letterSpacing="wide">
              Upload Document
            </Text>
          </HStack>
          <Box p={5}>
            <Box
              as="label"
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              w="full"
              h={32}
              border="2px dashed"
              borderColor={file ? 'aws.orange' : 'gray.300'}
              borderRadius="lg"
              cursor="pointer"
              bg={file ? 'orange.50' : 'gray.50'}
              _hover={{ borderColor: 'aws.orange', bg: 'orange.50' }}
              transition="all 0.15s"
            >
              <Icon as={MdDescription} boxSize={8} color="gray.400" mb={2} />
              {file ? (
                <Text fontSize="sm" fontWeight="medium" color="aws.orange">{file.name}</Text>
              ) : (
                <>
                  <Text fontSize="sm" color="gray.500">Click to select a file</Text>
                  <Text fontSize="xs" color="gray.400" mt={1}>PDF, Markdown (.md), Plain text (.txt)</Text>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.md,.markdown,.txt"
                style={{ display: 'none' }}
                onChange={(e) => { setFile(e.target.files?.[0] || null); setProgress(null) }}
                disabled={uploading}
              />
            </Box>

            <Button
              mt={4}
              w="full"
              bg="aws.orange"
              color="aws.squid"
              fontWeight="bold"
              _hover={{ bg: 'aws.orangeDark' }}
              isDisabled={!file || uploading}
              isLoading={uploading}
              loadingText="Uploading…"
              onClick={handleUpload}
            >
              Upload &amp; Index
            </Button>

            {progress && (
              <VStack mt={4} spacing={1} align="stretch">
                <HStack justify="space-between" fontSize="xs" color="gray.500">
                  <Text textTransform="capitalize">{progress.status}</Text>
                  <Text>{progress.progress_pct}%</Text>
                </HStack>
                <Progress
                  value={progress.progress_pct}
                  colorScheme={progressColorScheme}
                  borderRadius="full"
                  size="sm"
                  hasStripe={progress.status === 'indexing'}
                  isAnimated={progress.status === 'indexing'}
                />
                <Text fontSize="xs" color="gray.500">{progress.message}</Text>
                {progress.status === 'indexed' && (
                  <Alert status="success" borderRadius="md" py={2}>
                    <AlertIcon />
                    <Text fontSize="sm">Document indexed successfully</Text>
                  </Alert>
                )}
                {progress.status === 'error' && (
                  <Alert status="error" borderRadius="md" py={2}>
                    <AlertIcon />
                    <Text fontSize="sm">{progress.message}</Text>
                  </Alert>
                )}
              </VStack>
            )}
          </Box>
        </Box>

        {/* Indexed documents */}
        <Box bg="white" borderRadius="xl" border="1px solid" borderColor="gray.200" boxShadow="sm" overflow="hidden">
          <HStack px={5} py={3} borderBottom="1px solid" borderColor="gray.100" bg="gray.50" spacing={2} justify="space-between">
            <HStack spacing={2}>
              <Icon as={MdFolder} color="aws.orange" boxSize={4} />
              <Text fontSize="xs" fontWeight="semibold" color="gray.600" textTransform="uppercase" letterSpacing="wide">
                Indexed Documents
              </Text>
            </HStack>
            <Badge colorScheme="gray" fontSize="10px" fontStyle="italic">sample data</Badge>
          </HStack>
          <VStack divider={<Divider />} spacing={0} align="stretch">
            {MOCK_INDEXED_DOCS.map((doc) => (
              <HStack key={doc.name} px={5} py={3} spacing={4}>
                <Icon as={MdDescription} color="gray.400" boxSize={5} flexShrink={0} />
                <Box flex={1} minW={0}>
                  <Text fontSize="sm" color="gray.800" fontWeight="medium" noOfLines={1}>{doc.name}</Text>
                  <Text fontSize="xs" color="gray.400">{doc.size} · {doc.chunks} chunks · {doc.date}</Text>
                </Box>
                <Badge colorScheme="green" flexShrink={0}>Indexed</Badge>
              </HStack>
            ))}
          </VStack>
        </Box>
      </VStack>
    </Box>
  )
}
