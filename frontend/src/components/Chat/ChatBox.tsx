import React, { useState, useRef, useEffect } from 'react'
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
import { MdSend, MdBolt } from 'react-icons/md'
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

interface Message {
  role: 'user' | 'assistant'
  content: string
  diagram?: string
  iac?: IaC[]
  costs?: Costs
}

const PROMPT_CHIPS = [
  'Serverless e-commerce API',
  'Multi-region DR setup',
  'ML inference pipeline',
  'Event-driven microservices',
]

export const ChatBox: React.FC = () => {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const toast = useToast()

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const handleSend = async () => {
    if (!input.trim()) return
    setError(null)

    const userMessage: Message = { role: 'user', content: input }
    setMessages((prev) => [...prev, userMessage])
    setInput('')
    setLoading(true)

    try {
      const response = await fetch('/api/v1/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input }),
      })
      const data = await response.json()
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.text,
          diagram: data.diagram,
          iac: data.iac,
          costs: data.costs,
        },
      ])
    } catch {
      setError('Something went wrong — please try again.')
    } finally {
      setLoading(false)
    }
  }

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
}
