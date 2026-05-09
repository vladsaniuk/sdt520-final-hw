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
  useToast,
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
  const toast = useToast()
  const [dragging, setDragging] = useState(false)

  const notify = (status: 'success' | 'error' | 'warning', title: string, description?: string) =>
    toast({ title, description, status, variant: 'subtle', duration: status === 'error' ? 5000 : 3000,
      isClosable: true, position: 'bottom-right', containerStyle: { minW: '640px', maxW: '640px' } })

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
    const doc = docs.find(d => d.id === id)
    setDeletingId(id)
    try {
      const res = await fetch(`/api/v1/knowledge/documents/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error()
      await fetchDocs()
      notify('success', 'Document removed', doc?.filename)
    } catch {
      notify('error', 'Failed to remove document', doc?.filename)
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
            if (msg.status === 'indexed') {
              fetchDocs()
              notify('success', 'Document indexed', file.name)
            } else {
              notify('error', 'Indexing failed', msg.message || file.name)
            }
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
        notify('error', 'Upload failed', file.name)
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
              minH={32}
              border="2px dashed"
              borderColor={dragging ? 'aws.orange' : files.length > 0 ? 'aws.orange' : 'gray.300'}
              borderRadius="lg"
              cursor="pointer"
              bg={dragging ? 'orange.100' : files.length > 0 ? 'orange.50' : 'gray.50'}
              _hover={{ borderColor: 'aws.orange', bg: 'orange.50' }}
              transition="all 0.15s"
              p={4}
              onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragging(true) }}
              onDragEnter={(e) => { e.preventDefault(); if (!uploading) setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault()
                setDragging(false)
                if (uploading) return
                const allowed = ['.pdf', '.md', '.markdown', '.txt']
                const all = Array.from(e.dataTransfer.files)
                const valid = all.filter(f => allowed.some(ext => f.name.toLowerCase().endsWith(ext)))
                const invalid = all.filter(f => !allowed.some(ext => f.name.toLowerCase().endsWith(ext)))
                if (invalid.length > 0) {
                  notify('warning', `Unsupported file${invalid.length > 1 ? 's' : ''} dropped`,
                    `Only PDF, Markdown, and plain text files are supported. Ignored: ${invalid.map(f => f.name).join(', ')}`)
                }
                if (valid.length > 0) { setFiles(valid); setProgress(null) }
              }}
              onClick={() => !uploading && inputRef.current?.click()}
            >
              {files.length > 0 ? (
                <Box
                  display="flex"
                  flexWrap="wrap"
                  gap={2}
                  justifyContent="center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {files.map((f, i) => {
                    const ext = f.name.split('.').pop()?.toLowerCase() ?? ''
                    const isPdf = ext === 'pdf'
                    const isMd = ext === 'md' || ext === 'markdown'
                    const color = isPdf ? '#E53E3E' : isMd ? '#3182CE' : '#718096'
                    const label = f.name.length > 14 ? f.name.slice(0, 11) + '…' : f.name
                    return (
                      <VStack
                        key={i}
                        spacing={1}
                        align="center"
                        w="60px"
                        cursor="default"
                        title={f.name}
                      >
                        <svg width="36" height="44" viewBox="0 0 36 44" fill="none" xmlns="http://www.w3.org/2000/svg">
                          {/* Page body */}
                          <rect x="1" y="1" width="34" height="42" rx="3" fill="white" stroke={color} strokeWidth="1.5"/>
                          {/* Folded corner */}
                          <path d="M24 1 L35 12 L24 12 Z" fill={color} opacity="0.2"/>
                          <path d="M24 1 L35 12 H24 V1 Z" stroke={color} strokeWidth="1.5" strokeLinejoin="round" fill="white"/>
                          {/* Content lines or type indicator */}
                          {isPdf ? (
                            <text x="18" y="32" textAnchor="middle" fill={color} fontSize="9" fontWeight="bold" fontFamily="monospace">PDF</text>
                          ) : isMd ? (
                            <text x="18" y="32" textAnchor="middle" fill={color} fontSize="11" fontWeight="bold" fontFamily="monospace">#</text>
                          ) : (
                            <>
                              <line x1="8" y1="20" x2="28" y2="20" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                              <line x1="8" y1="25" x2="28" y2="25" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                              <line x1="8" y1="30" x2="20" y2="30" stroke={color} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                            </>
                          )}
                        </svg>
                        <Text fontSize="9px" color="gray.600" textAlign="center" lineHeight="1.2" wordBreak="break-all">
                          {label}
                        </Text>
                      </VStack>
                    )
                  })}
                </Box>
              ) : (
                <>
                  <Icon as={MdDescription} boxSize={8} color="gray.400" mb={2} />
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

            <HStack mt={4} spacing={3}>
              <Button
                flex={1}
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
              {(files.length > 0 || progress) && !uploading && (
                <Button
                  variant="outline"
                  colorScheme="gray"
                  onClick={() => { setFiles([]); setProgress(null); setQueueIndex(null); if (inputRef.current) inputRef.current.value = '' }}
                >
                  Clear
                </Button>
              )}
            </HStack>

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
