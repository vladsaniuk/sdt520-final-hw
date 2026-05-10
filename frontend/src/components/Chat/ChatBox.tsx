import React, { useState, useRef, useEffect, forwardRef, useImperativeHandle, useCallback } from 'react'
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Textarea,
  IconButton,
  Icon,
  Button,
  Avatar,
  useToast,
  Alert,
  AlertIcon,
  CloseButton,
  Spinner,
  Tag,
} from '@chakra-ui/react'
import { MdSend, MdBolt, MdWarning, MdCompress, MdClear } from 'react-icons/md'
import { MermaidViewer } from '../Diagram/MermaidViewer'
import { CodeSnippet } from '../Code/Snippet'
import { CostTable } from '../Cost/CostTable'

interface IaC {
  type: string
  content: string
}

interface CostBreakdown {
  service: string
  cost: number
  is_calculated: boolean
}

interface Costs {
  total: number
  breakdown: CostBreakdown[]
}

interface ServiceItem {
  name: string
  description: string
  rationale: string
}

interface Message {
  role: 'user' | 'assistant' | 'error' | 'approval'
  content: string
  diagram?: string
  iac?: IaC[]
  costs?: Costs
  services?: ServiceItem[]
  recommendationId?: string
}

interface StoredMessage {
  role: 'human' | 'ai'
  content: string
}

export interface ChatBoxHandle {
  compact: () => Promise<void>
  clear: () => Promise<void>
  hasMessages: () => boolean
}

interface ChatBoxProps {
  conversationId?: string
  onSessionUpdate?: (
    id: string,
    messages: Message[],
    updatedAt: number,
  ) => void
}

const MODEL_MAX_TOKENS = 128_000
const WARN_THRESHOLD = 75

function estimateFillPercent(messages: Message[], currentInput: string): number {
  const allText = messages.map(m => m.content).join('') + currentInput
  const estimatedTokens = Math.ceil(allText.length / 4)
  return Math.min(Math.round((estimatedTokens / MODEL_MAX_TOKENS) * 100), 100)
}

function computeDiff(
  prev: ServiceItem[] | undefined,
  curr: ServiceItem[]
): { added: string[]; removed: string[] } {
  if (!prev || prev.length === 0) return { added: [], removed: [] }
  const prevNames = new Set(prev.map(s => s.name))
  const currNames = new Set(curr.map(s => s.name))
  return {
    added: curr.map(s => s.name).filter(n => !prevNames.has(n)),
    removed: prev.map(s => s.name).filter(n => !currNames.has(n)),
  }
}

function serializeHistory(messages: Message[]): StoredMessage[] {
  return messages
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role === 'user' ? 'human' : 'ai',
      content: m.content,
    }))
}

function getRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.floor(diffHr / 24)
  return diffDay === 1 ? 'Yesterday' : `${diffDay}d ago`
}

const PROMPT_CHIPS = [
  'Serverless e-commerce API',
  'Multi-region DR setup',
  'ML inference pipeline',
  'Event-driven microservices',
]

export const ChatBox = forwardRef<ChatBoxHandle, ChatBoxProps>(
  ({ conversationId: externalConvId, onSessionUpdate }, ref) => {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()

  // Conversation identity
  const [conversationId, setConversationId] = useState<string>(() => {
    if (externalConvId) return externalConvId
    return localStorage.getItem('aws_advisor_conv_id') || crypto.randomUUID()
  })

  // Context fill tracking
  const [fillPercent, setFillPercent] = useState(0)
  const [warningDismissed, setWarningDismissed] = useState(false)
  const [isCompacting, setIsCompacting] = useState(false)
  const [clearConfirming, setClearConfirming] = useState(false)

  // Approval state (D-06)
  const [approvedRecommendationId, setApprovedRecommendationId] = useState<string | null>(null)
  const [approvedHcl, setApprovedHcl] = useState<string | null>(null)
  const [approvalStatus, setApprovalStatus] = useState<'idle' | 'pending' | 'done' | 'error'>('idle')
  const [validationWarning, setValidationWarning] = useState<boolean>(false)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // Restore history from localStorage on mount
  useEffect(() => {
    const storedHistory = localStorage.getItem(`aws_advisor_history_${conversationId}`)
    if (storedHistory) {
      try {
        const parsed: StoredMessage[] = JSON.parse(storedHistory)
        const restored: Message[] = parsed.map(m => ({
          role: m.role === 'human' ? 'user' : 'assistant',
          content: m.content,
        }))
        setMessages(restored)
        setFillPercent(estimateFillPercent(restored, ''))
        // Re-hydrate sidebar — stored timestamp or now as fallback
        const storedUpdatedAt = localStorage.getItem(`aws_advisor_updated_${conversationId}`)
        const updatedAt = storedUpdatedAt ? parseInt(storedUpdatedAt, 10) : Date.now()
        onSessionUpdate?.(conversationId, restored, updatedAt)
      } catch {
        // Corrupt storage — start fresh
      }
    }
  }, [conversationId, onSessionUpdate])

  // Live pre-send context fill estimation
  useEffect(() => {
    if (messages.length === 0) {
      setFillPercent(0)
      return
    }
    setFillPercent(estimateFillPercent(messages, input))
  }, [input, messages])

  // Reset warning dismissed state when fill drops below threshold
  useEffect(() => {
    if (fillPercent < WARN_THRESHOLD) {
      setWarningDismissed(false)
    }
  }, [fillPercent])

  const handleSend = async () => {
    if (!input.trim()) return
    setError(null)

    const userMessage: Message = { role: 'user', content: input }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)
    const sentInput = input
    setInput('')
    setLoading(true)

    // Placeholder assistant bubble that gets filled token by token
    const assistantPlaceholder: Message = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantPlaceholder])

    try {
      const response = await fetch('/api/v1/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: sentInput,
          conversation_id: conversationId,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`)
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let streamingContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // SSE lines are separated by \n\n
        const parts = buffer.split('\n\n')
        buffer = parts.pop() ?? ''

        for (const part of parts) {
          const line = part.trim()
          if (!line.startsWith('data: ')) continue
          const jsonStr = line.slice(6)
          let event: Record<string, unknown>
          try {
            event = JSON.parse(jsonStr)
          } catch {
            continue
          }

          if (event.type === 'token') {
            streamingContent += (event.content as string)
            // Update the last assistant bubble in real-time
            setMessages(prev => {
              const copy = [...prev]
              const lastIdx = copy.length - 1
              if (copy[lastIdx]?.role === 'assistant') {
                copy[lastIdx] = { ...copy[lastIdx], content: streamingContent }
              }
              return copy
            })
          } else if (event.type === 'status') {
            setMessages(prev => {
              const copy = [...prev]
              const lastIdx = copy.length - 1
              if (copy[lastIdx]?.role === 'assistant') {
                copy[lastIdx] = { ...copy[lastIdx], content: event.content as string }
              }
              return copy
            })
            streamingContent = ''
          } else if (event.type === 'done') {
            const payload = event.payload as Record<string, unknown>
            const phase = payload.phase as string
            const newConvId = (payload.conversation_id as string) || conversationId

            if (newConvId !== conversationId) {
              setConversationId(newConvId)
              localStorage.setItem('aws_advisor_conv_id', newConvId)
            }

            if (phase === 'gathering') {
              // Replace placeholder with final gathering text
              setMessages(prev => {
                const copy = [...prev]
                const lastIdx = copy.length - 1
                if (copy[lastIdx]?.role === 'assistant') {
                  copy[lastIdx] = { role: 'assistant', content: payload.text as string }
                }
                return copy
              })
            } else {
              // presenting — attach architecture data to bubble
              setMessages(prev => {
                const copy = [...prev]
                const lastIdx = copy.length - 1
                if (copy[lastIdx]?.role === 'assistant') {
                  copy[lastIdx] = {
                    role: 'assistant',
                    content: payload.text as string || streamingContent,
                    diagram: payload.diagram as string | undefined,
                    iac: payload.iac as IaC[] | undefined,
                    costs: payload.costs as Costs | undefined,
                    services: payload.services as ServiceItem[] | undefined,
                    recommendationId: payload.recommendation_id as string | undefined,
                  }
                }
                return copy
              })
            }

            const updatedAt = Date.now()
            localStorage.setItem('aws_advisor_conv_id', newConvId)
            onSessionUpdate?.(newConvId, messages, updatedAt)

          } else if (event.type === 'error') {
            const errorMsg: Message = { role: 'error', content: event.message as string }
            setMessages(prev => {
              const copy = prev.filter((_, idx) => idx !== prev.length - 1)
              return [...copy, errorMsg]
            })
            toast({
              title: 'Plan generation failed',
              description: String(event.message),
              status: 'error',
              duration: 5000,
              isClosable: true,
              position: 'bottom',
            })
          }
        }
      }

    } catch {
      setError('Something went wrong — please try again.')
      // Remove the placeholder bubble
      setMessages(prev => prev.filter((_, idx) => idx !== prev.length - 1))
    } finally {
      setLoading(false)
    }
  }

  const handleCompact = useCallback(async () => {
    setIsCompacting(true)
    try {
      const response = await fetch(`/api/v1/chat/${conversationId}/compact`, {
        method: 'POST',
      })
      if (!response.ok) throw new Error('Compact request failed')
      setFillPercent(0)
      setWarningDismissed(false)
      localStorage.removeItem(`aws_advisor_history_${conversationId}`)
      toast({
        title: 'Conversation compacted',
        description: 'Architecture context preserved.',
        status: 'success',
        duration: 3000,
        isClosable: true,
        position: 'bottom',
      })
    } catch {
      toast({
        title: 'Compact failed',
        description: 'Could not summarize conversation. Please try again.',
        status: 'error',
        duration: 4000,
        isClosable: true,
        position: 'bottom',
      })
    } finally {
      setIsCompacting(false)
    }
  }, [conversationId, toast])

  const handleClear = useCallback(async () => {
    try {
      await fetch(`/api/v1/chat/${conversationId}/clear`, { method: 'POST' })
    } catch {
      // Non-fatal: clear frontend state regardless
    }
    setMessages([])
    setFillPercent(0)
    setWarningDismissed(false)
    setClearConfirming(false)
    localStorage.removeItem(`aws_advisor_history_${conversationId}`)
    localStorage.removeItem(`aws_advisor_updated_${conversationId}`)
    onSessionUpdate?.(conversationId, [], Date.now())
  }, [conversationId, onSessionUpdate])

  useImperativeHandle(ref, () => ({
    compact: handleCompact,
    clear: handleClear,
    hasMessages: () => messages.length > 0,
  }), [handleCompact, handleClear, messages.length])

  const handleApprove = async (recommendationId: string) => {
    // Reset previous approval state — only one plan approved at a time (D-01)
    setApprovedRecommendationId(recommendationId)
    setApprovalStatus('pending')
    setApprovedHcl(null)
    setValidationWarning(false)

    // Insert approval status bubble into messages thread (D-21: new bubble per action)
    // Filter out any existing approval bubble first — only one plan approved at a time (D-01)
    setMessages(prev => [
      ...prev.filter(m => m.role !== 'approval'),
      { role: 'approval', content: 'Generating Terraform config…' },
    ])

    try {
      const res = await fetch(`/api/v1/chat/${conversationId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendation_id: recommendationId }),
      })
      if (!res.ok) throw new Error(`Approve failed: ${res.status}`)
      const data = await res.json()
      setApprovedHcl(data.hcl)
      setApprovalStatus('done')
      // valid=false (not null) means terraform found syntax errors
      setValidationWarning(data.valid === false)
      if (data.valid === false && data.validation_errors?.length > 0) {
        toast({
          title: 'Terraform config generated with warnings',
          description: data.validation_errors.slice(0, 2).join('; '),
          status: 'warning',
          duration: 6000,
          isClosable: true,
          position: 'bottom',
        })
      }
    } catch {
      setApprovalStatus('error')
      toast({
        title: 'Approval failed',
        description: 'Could not generate Terraform config. Please try again.',
        status: 'error',
        duration: 4000,
        isClosable: true,
        position: 'bottom',
      })
    }
  }

  const handleDownload = () => {
    if (!approvedHcl || !approvedRecommendationId) return
    const blob = new Blob([approvedHcl], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `architecture-${approvedRecommendationId.slice(0, 8)}.tf`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <Flex direction="column" h="full" bg="gray.50">
      {/* Messages / Welcome */}
      <Box flex={1} overflowY="auto" display={messages.length === 0 ? 'flex' : 'block'}>
        {messages.length === 0 ? (
          /* Welcome screen */
          <Flex direction="column" align="center" justify="center" flex={1} gap={6} px={4}>
            <VStack spacing={3} align="center">
              <Flex
                w={16} h={16} borderRadius="2xl" bg="aws.orange"
                align="center" justify="center"
                boxShadow="0 4px 24px rgba(255,153,0,0.35)"
              >
                <Icon as={MdBolt} color="aws.squid" boxSize={9} />
              </Flex>
              <Text fontSize="2xl" fontWeight="bold" color="aws.squid">AWS Architecture Advisor</Text>
              <Text fontSize="sm" color="gray.500" textAlign="center" maxW="xs" lineHeight="relaxed">
                Describe your AWS workload and I'll guide you through the design process.
              </Text>
            </VStack>
            <Flex wrap="wrap" gap={2} justify="center" maxW="lg">
              {PROMPT_CHIPS.map((chip) => (
                <Tag
                  key={chip}
                  as="button"
                  size="md"
                  variant="outline"
                  borderRadius="full"
                  cursor="pointer"
                  px={4} py={2}
                  borderColor="gray.300"
                  color="gray.700"
                  _hover={{ borderColor: 'aws.orange', color: 'aws.squid', bg: 'orange.50' }}
                  transition="all 0.15s"
                  onClick={() => setInput(chip)}
                >
                  {chip}
                </Tag>
              ))}
            </Flex>
          </Flex>
        ) : (
          /* Message list */
          <VStack px={4} py={6} spacing={6} align="stretch">
            {messages.map((msg, i) => {
              // Compute diff for assistant messages (D-22)
              const prevAssistantServices = messages
                .slice(0, i)
                .filter(m => m.role === 'assistant' && m.services)
                .pop()?.services
              const diff = msg.role === 'assistant' && msg.services && prevAssistantServices !== undefined
                ? computeDiff(prevAssistantServices, msg.services)
                : { added: [], removed: [] }
              const hasDiff = diff.added.length > 0 || diff.removed.length > 0

              // Error bubble (D-20)
              if (msg.role === 'error') {
                return (
                  <Flex key={i} gap={3} justify="flex-start">
                    <Flex
                      w={8} h={8} borderRadius="full" bg="aws.orange"
                      align="center" justify="center" flexShrink={0} mt={1}
                      boxShadow="sm"
                    >
                      <Icon as={MdBolt} color="aws.squid" boxSize={4} />
                    </Flex>
                    <Box maxW="3xl">
                      <Box
                        bg="red.50"
                        border="1px solid"
                        borderColor="red.200"
                        borderRadius="2xl"
                        borderTopLeftRadius="sm"
                        px={4}
                        py={3}
                        boxShadow="sm"
                      >
                        <HStack spacing={2} align="flex-start">
                          <Icon as={MdWarning} color="red.500" boxSize={4} flexShrink={0} />
                          <VStack spacing={0} align="flex-start">
                            <Text fontSize="sm" fontWeight="semibold" color="red.700">
                              Failed to generate plan
                            </Text>
                            <Text fontSize="sm" color="red.600" lineHeight="relaxed">
                              The advisor couldn't process your request after retrying. Please rephrase and try again.
                            </Text>
                          </VStack>
                        </HStack>
                      </Box>
                    </Box>
                  </Flex>
                )
              }

              // Approval status bubble (D-05) — role 'approval' inserted by handleApprove
              if (msg.role === 'approval') {
                return (
                  <Flex key={i} gap={3} justify="flex-start">
                    <Flex
                      w={8} h={8} borderRadius="full" bg="aws.orange"
                      align="center" justify="center" flexShrink={0} mt={1}
                      boxShadow="sm"
                    >
                      <Icon as={MdBolt} color="aws.squid" boxSize={4} />
                    </Flex>
                    <Box
                      bg="white"
                      border="1px solid"
                      borderColor="gray.200"
                      borderRadius="2xl"
                      borderTopLeftRadius="sm"
                      px={4} py={3}
                      boxShadow="sm"
                    >
                      {approvalStatus === 'pending' && (
                        <HStack spacing={2}>
                          <Spinner size="xs" color="gray.400" />
                          <Text fontSize="sm" color="gray.500">Generating Terraform config…</Text>
                        </HStack>
                      )}
                      {approvalStatus === 'done' && (
                        <VStack align="start" spacing={2}>
                          <Button
                            size="sm"
                            colorScheme="green"
                            onClick={handleDownload}
                          >
                            Download .tf
                          </Button>
                          {validationWarning && (
                            <Text fontSize="xs" color="orange.500">
                              Config generated with warnings — review before deploying
                            </Text>
                          )}
                        </VStack>
                      )}
                      {approvalStatus === 'error' && (
                        <Text fontSize="sm" color="red.500">
                          Generation failed. Please try again.
                        </Text>
                      )}
                    </Box>
                  </Flex>
                )
              }

              return (
                <Flex key={i} gap={3} justify={msg.role === 'user' ? 'flex-end' : 'flex-start'}>
                  {msg.role === 'assistant' && (
                    <Flex
                      w={8} h={8} borderRadius="full" bg="aws.orange"
                      align="center" justify="center" flexShrink={0} mt={1}
                      boxShadow="sm"
                    >
                      <Icon as={MdBolt} color="aws.squid" boxSize={4} />
                    </Flex>
                  )}

                  <Box maxW="3xl">
                    <Box
                      px={4} py={3}
                      borderRadius={msg.role === 'user' ? '2xl' : '2xl'}
                      borderTopRightRadius={msg.role === 'user' ? 'sm' : undefined}
                      borderTopLeftRadius={msg.role === 'assistant' ? 'sm' : undefined}
                      bg={msg.role === 'user' ? 'aws.squid' : 'white'}
                      color={msg.role === 'user' ? 'white' : 'gray.800'}
                      border={msg.role === 'assistant' ? '1px solid' : undefined}
                      borderColor="gray.200"
                      boxShadow="sm"
                      ml={msg.role === 'user' ? 'auto' : undefined}
                      fontSize="sm"
                      lineHeight="relaxed"
                    >
                      <Text whiteSpace="pre-wrap">{msg.content}</Text>
                    </Box>

                    {/* Diff badge row (D-21, D-22) — shown on assistant bubbles after first */}
                    {msg.role === 'assistant' && hasDiff && (
                      <HStack
                        spacing={1}
                        mt={1}
                        flexWrap="wrap"
                        aria-label={`Changes from previous plan: ${diff.added.join(', ')} added, ${diff.removed.join(', ')} removed`}
                      >
                        {diff.added.map(name => (
                          <Tag
                            key={`add-${name}`}
                            size="sm"
                            borderRadius="md"
                            bg="green.100"
                            color="green.700"
                            fontWeight="semibold"
                            fontSize="11px"
                            px={2}
                            py={0}
                          >
                            +{name}
                          </Tag>
                        ))}
                        {diff.removed.map(name => (
                          <Tag
                            key={`rem-${name}`}
                            size="sm"
                            borderRadius="md"
                            bg="red.100"
                            color="red.700"
                            fontWeight="semibold"
                            fontSize="11px"
                            px={2}
                            py={0}
                          >
                            {'\u2212'}{name}
                          </Tag>
                        ))}
                      </HStack>
                    )}

                    {/* Approve/Approved button — one plan approved at a time (D-01, D-05) */}
                    {msg.role === 'assistant' && msg.recommendationId && (
                      <HStack mt={2}>
                        {approvedRecommendationId === msg.recommendationId ? (
                          <Tag colorScheme="green" size="sm">✓ Approved</Tag>
                        ) : (
                          <Button
                            size="xs"
                            variant="outline"
                            colorScheme="green"
                            onClick={() => handleApprove(msg.recommendationId!)}
                            isDisabled={approvalStatus === 'pending'}
                          >
                            Approve
                          </Button>
                        )}
                      </HStack>
                    )}

                    {msg.role === 'assistant' && (
                      <>
                        {msg.diagram && <MermaidViewer definition={msg.diagram} />}
                        {msg.costs && msg.costs.breakdown.length > 0 && (
                          <CostTable total={msg.costs.total} breakdown={msg.costs.breakdown} />
                        )}
                        {msg.iac && msg.iac.length > 0 && (
                          <Box mt={3} borderRadius="xl" overflow="hidden" border="1px solid" borderColor="gray.200" boxShadow="sm">
                            <HStack px={4} py={2} bg="aws.squid" borderBottom="1px solid" borderColor="aws.squidLight" justify="space-between">
                              <HStack spacing={2}>
                                <Text fontSize="xs" fontWeight="bold" color="gray.300" textTransform="uppercase" letterSpacing="widest">
                                  Terraform
                                </Text>
                              </HStack>
                              <Button
                                size="xs"
                                bg="aws.orange"
                                color="aws.squid"
                                fontWeight="bold"
                                _hover={{ bg: 'aws.orangeDark' }}
                                onClick={() => msg.recommendationId && handleApprove(msg.recommendationId)}
                                isDisabled={approvalStatus === 'pending' || !msg.recommendationId}
                              >
                                {approvedRecommendationId === msg.recommendationId ? 'Approved ✓' : 'Approve & Download'}
                              </Button>
                            </HStack>
                            <Box p={4}>
                              <VStack spacing={3} align="stretch">
                                {msg.iac.map((snippet, j) => (
                                  <CodeSnippet
                                    key={j}
                                    code={snippet.content}
                                    language={snippet.type === 'terraform' ? 'hcl' : 'yaml'}
                                  />
                                ))}
                              </VStack>
                            </Box>
                          </Box>
                        )}
                      </>
                    )}
                  </Box>

                  {msg.role === 'user' && (
                    <Avatar size="sm" name="U" bg="gray.300" color="gray.700" mt={1} flexShrink={0} />
                  )}
                </Flex>
              )
            })}

            {loading && (
              <Flex gap={3} justify="flex-start">
                <Flex w={8} h={8} borderRadius="full" bg="aws.orange" align="center" justify="center" flexShrink={0} boxShadow="sm">
                  <Icon as={MdBolt} color="aws.squid" boxSize={4} />
                </Flex>
                <Box bg="white" border="1px solid" borderColor="gray.200" borderRadius="2xl" borderTopLeftRadius="sm" px={4} py={3} boxShadow="sm">
                  <HStack spacing={1} h={5} align="center">
                    <Spinner size="xs" color="gray.400" />
                    <Text fontSize="xs" color="gray.400">Thinking…</Text>
                  </HStack>
                </Box>
              </Flex>
            )}
            <Box ref={bottomRef} />
          </VStack>
        )}
      </Box>

      {/* Warning banner — context fill >= 75% (UI-SPEC §2) */}
      {fillPercent >= WARN_THRESHOLD && !warningDismissed && (
        <Alert
          status="warning"
          bg="orange.50"
          borderRadius="lg"
          border="1px solid"
          borderColor="orange.300"
          mx={4}
          mb={3}
          alignItems="flex-start"
        >
          <AlertIcon color="orange.500" mt={1} />
          <VStack align="flex-start" spacing={1} flex={1}>
            <Text fontSize="sm" fontWeight="semibold" color="gray.800">
              Context window is {fillPercent}% full
            </Text>
            <Text fontSize="13px" color="gray.600">
              Older messages may be dropped on the next turn. Compact the conversation to preserve architecture decisions, or clear to start fresh.
            </Text>
            <HStack spacing={2} mt={1}>
              <Button
                size="xs"
                bg="aws.orange"
                color="aws.squid"
                fontWeight="bold"
                _hover={{ bg: 'aws.orangeDark' }}
                isLoading={isCompacting}
                loadingText="Compacting…"
                onClick={handleCompact}
              >
                Compact
              </Button>
              {clearConfirming ? (
                <HStack spacing={2}>
                  <Text fontSize="xs" color="gray.500">Clear all messages?</Text>
                  <Button size="xs" colorScheme="red" onClick={handleClear}>Yes, clear</Button>
                  <Button size="xs" variant="ghost" color="gray.500" onClick={() => setClearConfirming(false)}>Cancel</Button>
                </HStack>
              ) : (
                <Button
                  size="xs"
                  bg="red.100"
                  color="red.700"
                  fontWeight="semibold"
                  _hover={{ bg: 'red.200' }}
                  onClick={() => setClearConfirming(true)}
                >
                  Clear history
                </Button>
              )}
            </HStack>
          </VStack>
          <CloseButton
            alignSelf="flex-start"
            aria-label="Dismiss context warning"
            onClick={() => setWarningDismissed(true)}
          />
        </Alert>
      )}

      {/* Error banner */}
      {error && (
        <Alert status="error" mx={4} mb={3} borderRadius="lg">
          <AlertIcon />
          <Text flex={1} fontSize="sm">{error}</Text>
          <CloseButton onClick={() => setError(null)} />
        </Alert>
      )}

      {/* Input area */}
      <Box flexShrink={0} bg="white" borderTop="1px solid" borderColor="gray.200" px={4} py={3}>
        <HStack maxW="3xl" mx="auto" align="flex-end" spacing={2}>
          <Textarea
            ref={textareaRef}
            flex={1}
            resize="none"
            rows={1}
            placeholder="Describe your system or answer the advisor's questions…"
            fontSize="sm"
            borderRadius="xl"
            borderColor="gray.300"
            _focus={{ borderColor: 'aws.orange', boxShadow: '0 0 0 1px #FF9900' }}
            maxH="160px"
            minH="44px"
            value={input}
            onChange={(e) => {
              setInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
          />
          <IconButton
            aria-label="Send"
            icon={<Icon as={MdSend} />}
            isDisabled={loading || !input.trim()}
            onClick={handleSend}
            bg="aws.orange"
            color="aws.squid"
            _hover={{ bg: 'aws.orangeDark' }}
            _disabled={{ bg: 'gray.200', color: 'gray.400', cursor: 'not-allowed' }}
            borderRadius="xl"
            h="44px"
            w="44px"
            flexShrink={0}
          />
        </HStack>
        {/* Context fill bar (UI-SPEC §1) — visible when messages exist */}
        {messages.length > 0 && (
          <HStack maxW="3xl" mx="auto" spacing={2} mt={1} mb={1} w="full" align="center">
            <Box flex={1} h="4px" bg="gray.200" borderRadius="full">
              <Box
                h="4px"
                w={`${fillPercent}%`}
                bg={fillPercent >= 90 ? 'red.500' : fillPercent >= 75 ? 'aws.orange' : 'green.400'}
                borderRadius="full"
                transition="width 0.3s ease"
              />
            </Box>
            <Text
              fontSize="11px"
              fontWeight="medium"
              color={fillPercent >= 90 ? 'red.500' : fillPercent >= 75 ? 'aws.orange' : 'gray.500'}
              flexShrink={0}
            >
              {fillPercent}%
            </Text>
            <Text fontSize="11px" color="gray.400" flexShrink={0}>
              Context
            </Text>
          </HStack>
        )}
        <Text textAlign="center" fontSize="xs" color="gray.400" mt={2}>
          Shift+Enter for new line · Enter to send
        </Text>
      </Box>
    </Flex>
  )
})
ChatBox.displayName = 'ChatBox'
