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
  role: 'user' | 'assistant' | 'error'
  content: string
  diagram?: string
  iac?: IaC[]
  costs?: Costs
  services?: ServiceItem[]
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
      } catch {
        // Corrupt storage — start fresh
      }
    }
  }, [conversationId])

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
    setInput('')
    setLoading(true)

    // Serialize history to send with request (messages BEFORE this turn)
    const serializedHistory = serializeHistory(messages)

    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: input,
          conversation_id: conversationId,
          history: serializedHistory,
        }),
      })
      const data = await response.json()

      // Update conversation_id from server (server may assign new one)
      if (data.conversation_id && data.conversation_id !== conversationId) {
        setConversationId(data.conversation_id)
        localStorage.setItem('aws_advisor_conv_id', data.conversation_id)
      }

      // D-20: server returns error field on structured output failure
      if (data.error) {
        const errorMsg: Message = { role: 'error', content: data.error }
        const withError = [...updatedMessages, errorMsg]
        setMessages(withError)
        toast({
          title: 'Plan generation failed',
          description: 'Structured output could not be parsed. See conversation for details.',
          status: 'error',
          duration: 5000,
          isClosable: true,
          position: 'bottom',
        })
        return
      }

      // Update fill with actual token usage if available
      if (data.usage?.prompt_tokens) {
        setFillPercent(Math.min(
          Math.round((data.usage.prompt_tokens / MODEL_MAX_TOKENS) * 100),
          100
        ))
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.text || '',
        diagram: data.diagram,
        iac: data.iac,
        costs: data.costs,
        services: data.services,
      }
      const finalMessages = [...updatedMessages, assistantMessage]
      setMessages(finalMessages)

      // Persist to localStorage
      const newConvId = data.conversation_id || conversationId
      localStorage.setItem('aws_advisor_conv_id', newConvId)
      localStorage.setItem(
        `aws_advisor_history_${newConvId}`,
        JSON.stringify(serializeHistory(finalMessages))
      )

      // Notify App.tsx of session update
      onSessionUpdate?.(newConvId, finalMessages, Date.now())

    } catch {
      setError('Something went wrong — please try again.')
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
    onSessionUpdate?.(conversationId, [], Date.now())
  }, [conversationId, onSessionUpdate])

  useImperativeHandle(ref, () => ({
    compact: handleCompact,
    clear: handleClear,
    hasMessages: () => messages.length > 0,
  }), [handleCompact, handleClear, messages.length])

  const showDownloadToast = () => {
    toast({
      title: 'Coming soon',
      description: 'Terraform download will be available in Phase 5.',
      status: 'info',
      duration: 3000,
      isClosable: true,
      position: 'bottom',
    })
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
                Describe your AWS workload to get a production-ready architecture plan.
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
            {messages.map((msg, i) => (
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
                              onClick={showDownloadToast}
                            >
                              Download .tf
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
            ))}

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
            placeholder="Describe your AWS workload…"
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
        <Text textAlign="center" fontSize="xs" color="gray.400" mt={2}>
          Shift+Enter for new line · Enter to send
        </Text>
      </Box>
    </Flex>
  )
})
ChatBox.displayName = 'ChatBox'
