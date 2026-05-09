import React, { useState, useRef, useEffect, useCallback } from 'react'
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
import { MdUploadFile, MdFolder, MdDescription, MdCheck, MdDelete } from 'react-icons/md'

interface ProgressState {
  status: string
  progress_pct: number
  message: string
}

interface IndexedDoc {
  id: string
  filename: string
  chunk_count: number
  indexed_at: string | null
  file_on_disk: boolean
}

const STAGES = [
  { key: 'upload',    label: 'Upload' },
  { key: 'parsing',   label: 'Parse' },
  { key: 'chunking',  label: 'Chunk' },
  { key: 'embedding', label: 'Embed' },
  { key: 'indexed',   label: 'Done' },
]

function getStageIndex(status: string): number {
  const map: Record<string, number> = {
    pending: 0, upload: 0,
    parsing: 1,
    chunking: 2,
    embedding: 3,
    indexed: 4, error: 4,
  }
  return map[status] ?? 0
}

export const KnowledgeBase: React.FC = () => {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<ProgressState | null>(null)
  const [queueIndex, setQueueIndex] = useState<{ current: number; total: number } | null>(null)
  const [docs, setDocs] = useState<IndexedDoc[]>([])
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const [deletingId, setDeletingId] = useState<string | null>(null)

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/knowledge/documents')
      const data = await res.json()
      setDocs(data.documents ?? [])
    } catch {
      // silently ignore — list stays empty
    }
  }, [])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await fetch(`/api/v1/knowledge/documents/${id}`, { method: 'DELETE' })
      await fetchDocs()
    } catch {
      // silently ignore
    } finally {
      setDeletingId(null)
    }
  }

  const TERMINAL_STATUSES = new Set(['indexed', 'error', 'unknown'])

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current)
      pollingRef.current = null
    }
  }

  const startPolling = (docId: string, onTerminal: () => void) => {
    pollingRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/v1/knowledge/status/${docId}`)
        const data = await res.json()
        if (data.status !== 'unknown') {
          setProgress({ status: data.status, progress_pct: data.progress_pct ?? 0, message: data.message ?? '' })
        }
        if (TERMINAL_STATUSES.has(data.status)) {
          stopPolling()
          onTerminal()
        }
      } catch {
        // Ignore polling errors silently
      }
    }, 2000)
  }

  // Returns a Promise that resolves when the file is fully indexed (or errored)
  const uploadOne = (file: File): Promise<void> => {
    return new Promise(async (resolve) => {
      setProgress({ status: 'parsing', progress_pct: 5, message: 'Reading document...' })
      const formData = new FormData()
      formData.append('file', file)
      try {
        const response = await fetch('/api/v1/knowledge/upload', { method: 'POST', body: formData })
        if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
        const data = await response.json()

        let receivedTerminal = false
        const ws = new WebSocket(`ws://localhost:8000/api/v1/knowledge/progress/${data.document_id}`)
        ws.onmessage = (event) => {
          const msg: ProgressState = JSON.parse(event.data)
          setProgress(msg)
          if (msg.status === 'indexed' || msg.status === 'error') {
            receivedTerminal = true
            if (msg.status === 'indexed') fetchDocs()
            ws.close()
            resolve()
          }
        }
        ws.onerror = () => {
          ws.close()
          if (!receivedTerminal) {
            startPolling(data.document_id, () => { fetchDocs(); resolve() })
          }
        }
      } catch (error) {
        setProgress({ status: 'error', progress_pct: 0, message: `Upload failed: ${String(error)}` })
        resolve()
      }
    })
  }

  const handleUpload = async () => {
    if (files.length === 0) return
    setUploading(true)
    const queue = [...files]
    setFiles([])
    if (inputRef.current) inputRef.current.value = ''

    for (let i = 0; i < queue.length; i++) {
      setQueueIndex({ current: i + 1, total: queue.length })
      setProgress(null)
      await uploadOne(queue[i])
    }

    setQueueIndex(null)
    setUploading(false)
  }

  const activeStage = progress ? getStageIndex(progress.status) : -1
  const isError = progress?.status === 'error'

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
              Upload Documents
            </Text>
          </HStack>
          <Box p={5}>
            <Box
              display="flex"
              flexDirection="column"
              alignItems="center"
              justifyContent="center"
              w="full"
              h={32}
              border="2px dashed"
              borderColor={dragging ? 'aws.orange' : files.length > 0 ? 'aws.orange' : 'gray.300'}
              borderRadius="lg"
              cursor="pointer"
              bg={dragging ? 'orange.100' : files.length > 0 ? 'orange.50' : 'gray.50'}
              _hover={{ borderColor: 'aws.orange', bg: 'orange.50' }}
              transition="all 0.15s"
              onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true) }}
              onDragEnter={(e) => { e.preventDefault(); if (!uploading) setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                if (uploading) return
                const dropped = Array.from(e.dataTransfer.files)
                if (dropped.length > 0) { setFiles(dropped); setProgress(null) }
              }}
              onClick={() => !uploading && inputRef.current?.click()}
            >
              <Icon as={MdDescription} boxSize={8} color="gray.400" mb={2} />
              {files.length > 0 ? (
                <VStack spacing={0}>
                  <Text fontSize="sm" fontWeight="medium" color="aws.orange">
                    {files.length === 1 ? files[0].name : `${files.length} files selected`}
                  </Text>
                  {files.length > 1 && (
                    <Text fontSize="xs" color="orange.400">{files.map(f => f.name).join(', ')}</Text>
                  )}
                </VStack>
              ) : (
                <>
                  <Text fontSize="sm" color="gray.500">Drag & drop files or click to select</Text>
                  <Text fontSize="xs" color="gray.400" mt={1}>PDF, Markdown (.md), Plain text (.txt) — multiple allowed</Text>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.md,.markdown,.txt"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => { setFiles(Array.from(e.target.files ?? [])); setProgress(null) }}
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
              isDisabled={files.length === 0 || uploading}
              isLoading={uploading && !progress}
              loadingText="Uploading…"
              onClick={handleUpload}
            >
              Upload &amp; Index{files.length > 1 ? ` (${files.length} files)` : ''}
            </Button>

            {/* Pipeline stages — shown after POST returns (button spinner covers upload stage) */}
            {(progress || queueIndex) && (
              <VStack mt={5} spacing={3} align="stretch">
                {/* Queue counter */}
                {queueIndex && queueIndex.total > 1 && (
                  <HStack justify="space-between" fontSize="xs" color="gray.500">
                    <Text>Processing file <strong>{queueIndex.current}</strong> of <strong>{queueIndex.total}</strong></Text>
                    {progress && <Text textTransform="capitalize" color="aws.orange">{progress.status}</Text>}
                  </HStack>
                )}
                {/* Stage indicators and progress — only when we have progress state */}
                {progress && (<>
                {/* Stage indicators */}
                <HStack spacing={0} align="center">
                  {STAGES.map((stage, i) => {
                    const done = !isError && i < activeStage
                    const active = i === activeStage
                    const errored = isError && i === activeStage
                    const color = errored
                      ? 'red.400'
                      : done
                      ? 'green.400'
                      : active
                      ? 'aws.orange'
                      : 'gray.300'

                    return (
                      <React.Fragment key={stage.key}>
                        <VStack spacing={1} flex={1} align="center">
                          <Box
                            w={7} h={7}
                            borderRadius="full"
                            bg={done || active ? color : 'gray.100'}
                            border="2px solid"
                            borderColor={color}
                            display="flex"
                            alignItems="center"
                            justifyContent="center"
                            transition="all 0.2s"
                          >
                            {done ? (
                              <Icon as={MdCheck} color="white" boxSize={4} />
                            ) : (
                              <Box
                                w={2} h={2}
                                borderRadius="full"
                                bg={active ? 'white' : 'gray.300'}
                              />
                            )}
                          </Box>
                          <Text
                            fontSize="10px"
                            fontWeight={active ? 'semibold' : 'normal'}
                            color={errored ? 'red.400' : active ? 'aws.orange' : done ? 'green.500' : 'gray.400'}
                          >
                            {stage.label}
                          </Text>
                        </VStack>
                        {/* Connector line between circles */}
                        {i < STAGES.length - 1 && (
                          <Box
                            flex={1}
                            h="2px"
                            bg={i < activeStage ? 'green.300' : 'gray.200'}
                            mb="14px"
                            transition="background 0.2s"
                          />
                        )}
                      </React.Fragment>
                    )
                  })}
                </HStack>

                {/* Progress bar — indeterminate for parse/chunk, percentage for embed */}
                {['parsing', 'chunking'].includes(progress.status) && (
                  <Box>
                    <Text fontSize="xs" color="gray.500" mb={1}>{progress.message}</Text>
                    <Progress
                      isIndeterminate
                      colorScheme="orange"
                      borderRadius="full"
                      size="sm"
                    />
                  </Box>
                )}
                {progress.status === 'embedding' && (() => {
                  // Remap global 30–90% to stage-local 0–100%
                  const embedPct = Math.round((progress.progress_pct - 30) / 60 * 100)
                  return (
                    <Box>
                      <HStack justify="space-between" fontSize="xs" color="gray.500" mb={1}>
                        <Text>{progress.message}</Text>
                        <Text>{embedPct}%</Text>
                      </HStack>
                      <Progress
                        value={embedPct}
                        colorScheme="orange"
                        borderRadius="full"
                        size="sm"
                        hasStripe
                        isAnimated
                      />
                    </Box>
                  )
                })()}

                {/* Status message for fast intermediate stages */}
                {!['parsing', 'chunking', 'embedding', 'indexed', 'error'].includes(progress.status) && (
                  <Text fontSize="xs" color="gray.500" textAlign="center">{progress.message}</Text>
                )}

                {progress.status === 'indexed' && (
                  <Alert status="success" borderRadius="md" py={2}>
                    <AlertIcon />
                    <Text fontSize="sm">{progress.message}</Text>
                  </Alert>
                )}
                {progress.status === 'error' && (
                  <Alert status="error" borderRadius="md" py={2}>
                    <AlertIcon />
                    <Text fontSize="sm">{progress.message}</Text>
                  </Alert>
                )}
                </>)}
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
            <Badge colorScheme="gray" fontSize="10px">{docs.length} document{docs.length !== 1 ? 's' : ''}</Badge>
          </HStack>
          {docs.length === 0 ? (
            <Box px={5} py={6} textAlign="center">
              <Text fontSize="sm" color="gray.400">No documents indexed yet</Text>
            </Box>
          ) : (
            <VStack divider={<Divider />} spacing={0} align="stretch">
              {docs.map((doc) => (
                <HStack key={doc.id} px={5} py={3} spacing={4}>
                  <Icon as={MdDescription} color="gray.400" boxSize={5} flexShrink={0} />
                  <Box flex={1} minW={0}>
                    <Text fontSize="sm" color="gray.800" fontWeight="medium" noOfLines={1}>{doc.filename}</Text>
                    <Text fontSize="xs" color="gray.400">
                      {doc.chunk_count} chunks
                      {doc.indexed_at ? ` · ${new Date(doc.indexed_at).toLocaleDateString()}` : ''}
                    </Text>
                  </Box>
                  {doc.file_on_disk
                    ? <Badge colorScheme="blue" flexShrink={0}>Uploaded</Badge>
                    : <Badge colorScheme="red" variant="outline" flexShrink={0}>Missing</Badge>
                  }
                  <Badge colorScheme="green" flexShrink={0}>Indexed</Badge>
                  <Button
                    size="xs"
                    variant="ghost"
                    colorScheme="red"
                    isLoading={deletingId === doc.id}
                    onClick={() => handleDelete(doc.id)}
                    aria-label="Remove document"
                    flexShrink={0}
                  >
                    <Icon as={MdDelete} boxSize={4} />
                  </Button>
                </HStack>
              ))}
            </VStack>
          )}
        </Box>
      </VStack>
    </Box>
  )
}
