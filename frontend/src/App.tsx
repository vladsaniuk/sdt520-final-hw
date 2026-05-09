import { useState, useRef, useCallback } from 'react'
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Button,
  Icon,
  useToast,
} from '@chakra-ui/react'
import { ChatBox } from './components/Chat/ChatBox'
import type { ChatBoxHandle } from './components/Chat/ChatBox'
import { KnowledgeBase } from './pages/KnowledgeBase'
import { MdAdd, MdBolt, MdOutlineArticle, MdCompress, MdClear } from 'react-icons/md'

type Page = 'chat' | 'knowledge'

interface Session {
  id: string
  title: string      // derived from first user message (max 32 chars)
  turnCount: number  // count of user messages
  updatedAt: number  // Date.now() at last update
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

function App() {
  const [page, setPage] = useState<Page>('chat')
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeConvId, setActiveConvId] = useState<string | undefined>(undefined)
  const [clearConfirming, setClearConfirming] = useState(false)

  // Ref to ChatBox for Compact/Clear sidebar controls (useImperativeHandle bridge)
  const chatRef = useRef<ChatBoxHandle>(null)
  const toast = useToast()

  // Called by ChatBox when messages change (new turn, clear, compact)
  const handleSessionUpdate = useCallback(
    (id: string, messages: Array<{ role: string; content: string }>, updatedAt: number) => {
      setSessions(prev => {
        const existing = prev.find(s => s.id === id)
        const firstUserMsg = messages.find(m => m.role === 'user')?.content ?? ''
        const title = firstUserMsg.slice(0, 32) || 'New conversation'
        const turnCount = messages.filter(m => m.role === 'user').length

        if (existing) {
          return prev.map(s =>
            s.id === id ? { ...s, title, turnCount, updatedAt } : s
          )
        }
        // New session — add to top
        return [{ id, title, turnCount, updatedAt }, ...prev]
      })
      setActiveConvId(id)
    },
    []
  )

  // Sidebar Compact handler — delegates to ChatBox via ref
  const handleSidebarCompact = useCallback(async () => {
    if (!chatRef.current?.hasMessages()) return
    await chatRef.current.compact()
  }, [])

  // Sidebar Clear handler — shows inline confirmation, then delegates
  const handleSidebarClearConfirm = useCallback(async () => {
    await chatRef.current?.clear()
    setClearConfirming(false)
  }, [])

  // New conversation — generate new UUID, clear active session
  const handleNewConversation = useCallback(() => {
    const newId = crypto.randomUUID()
    setActiveConvId(newId)
    setPage('chat')
    setClearConfirming(false)
  }, [])

  const hasMessages = chatRef.current?.hasMessages() ?? false

  // Suppress unused toast warning — toast available for future use
  void toast

  return (
    <Flex h="100vh" overflow="hidden" bg="gray.100">
      {/* Sidebar */}
      <Flex as="aside" direction="column" w="260px" flexShrink={0} bg="aws.squid" color="gray.100">
        {/* Logo — unchanged */}
        <HStack px={4} py={4} borderBottom="1px solid" borderColor="aws.squidLight" spacing={3}>
          <Flex w={8} h={8} borderRadius="md" bg="aws.orange" align="center" justify="center" flexShrink={0}>
            <Icon as={MdBolt} color="aws.squid" boxSize={5} />
          </Flex>
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="white" lineHeight="none">AWS</Text>
            <Text fontSize="10px" color="gray.400" lineHeight="none" mt="2px">Architecture Advisor</Text>
          </Box>
        </HStack>

        {/* New conversation button */}
        <Box px={3} pt={3}>
          <Button
            leftIcon={<Icon as={MdAdd} />}
            variant="outline"
            size="sm"
            w="full"
            justifyContent="flex-start"
            color="gray.300"
            borderColor="aws.squidLight"
            _hover={{ bg: 'aws.squidLight', color: 'white' }}
            onClick={handleNewConversation}
          >
            New conversation
          </Button>
        </Box>

        {/* Conversation session list — real sessions state (D-07, UI-SPEC §7) */}
        <VStack flex={1} overflowY="auto" px={2} py={3} spacing={0} align="stretch">
          <Text
            px={2} pb={1}
            fontSize="10px" fontWeight="semibold" textTransform="uppercase"
            letterSpacing="wider" color="gray.500"
          >
            Recent
          </Text>

          {sessions.length === 0 ? (
            <Text px={2} pt={2} fontSize="11px" color="gray.600" fontStyle="italic">
              No conversations yet. Send your first message.
            </Text>
          ) : (
            sessions.map(s => (
              <Box
                key={s.id}
                as="button"
                textAlign="left"
                px={3} py={2}
                borderRadius="md"
                bg={activeConvId === s.id ? 'aws.squidLight' : 'transparent'}
                _hover={{ bg: activeConvId === s.id ? 'aws.squidLight' : 'whiteAlpha.100' }}
                onClick={() => { setActiveConvId(s.id); setPage('chat') }}
                transition="background 0.15s"
              >
                <Text fontSize="sm" color="gray.200" fontWeight="medium" noOfLines={1}>
                  {s.title}
                </Text>
                <Text fontSize="11px" color="gray.500" noOfLines={1}>
                  {s.turnCount} turn{s.turnCount !== 1 ? 's' : ''} · {getRelativeTime(s.updatedAt)}
                </Text>
              </Box>
            ))
          )}
        </VStack>

        {/* Sidebar controls row — Compact + Clear (D-07: always visible) */}
        <HStack
          px={3} py={2} spacing={2}
          borderTop="1px solid" borderColor="aws.squidLight"
        >
          {/* Compact button */}
          <Button
            leftIcon={<Icon as={MdCompress} />}
            size="sm"
            variant="ghost"
            color="gray.300"
            _hover={{ bg: 'aws.squidLight', color: 'white' }}
            flex={1}
            justifyContent="center"
            fontSize="xs"
            fontWeight="semibold"
            isDisabled={!hasMessages}
            onClick={handleSidebarCompact}
          >
            Compact
          </Button>

          {/* Clear button — with inline confirmation */}
          {clearConfirming ? (
            <VStack flex={1} spacing={1} align="stretch">
              <Text fontSize="xs" color="gray.300" textAlign="center">Clear all messages?</Text>
              <HStack spacing={1} justify="center">
                <Button size="xs" colorScheme="red" onClick={handleSidebarClearConfirm}>
                  Yes, clear
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  color="gray.400"
                  onClick={() => setClearConfirming(false)}
                >
                  Cancel
                </Button>
              </HStack>
            </VStack>
          ) : (
            <Button
              leftIcon={<Icon as={MdClear} />}
              size="sm"
              variant="ghost"
              color="red.300"
              _hover={{ bg: 'red.900', color: 'red.200' }}
              flex={1}
              justifyContent="center"
              fontSize="xs"
              fontWeight="semibold"
              isDisabled={!hasMessages}
              onClick={() => setClearConfirming(true)}
            >
              Clear
            </Button>
          )}
        </HStack>

        {/* Footer nav — unchanged */}
        <Box borderTop="1px solid" borderColor="aws.squidLight" p={2}>
          <Button
            leftIcon={<Icon as={MdOutlineArticle} />}
            variant="ghost"
            size="sm"
            w="full"
            justifyContent="flex-start"
            bg={page === 'knowledge' ? 'aws.orange' : 'transparent'}
            color={page === 'knowledge' ? 'aws.squid' : 'gray.300'}
            fontWeight={page === 'knowledge' ? 'bold' : 'normal'}
            _hover={{ bg: page === 'knowledge' ? 'aws.orangeDark' : 'aws.squidLight', color: page === 'knowledge' ? 'aws.squid' : 'white' }}
            onClick={() => setPage('knowledge')}
          >
            Knowledge Base
          </Button>
        </Box>
      </Flex>

      {/* Main content — unchanged structure */}
      <Flex flex={1} direction="column" minW={0} overflow="hidden">
        {/* Top bar — unchanged */}
        <HStack
          as="header"
          h="48px"
          bg="white"
          borderBottom="1px solid"
          borderColor="gray.200"
          px={4}
          justify="space-between"
          flexShrink={0}
          boxShadow="sm"
        >
          <HStack spacing={2}>
            <Text color="gray.400" fontSize="sm">▸</Text>
            <Text fontWeight="medium" color="gray.800" fontSize="sm">
              {page === 'chat' ? 'Advisor' : 'Knowledge Base'}
            </Text>
          </HStack>
          <HStack spacing={2}>
            <Box w={2} h={2} borderRadius="full" bg="green.400" />
            <Text fontSize="xs" color="gray.400">Connected to Neo4j</Text>
          </HStack>
        </HStack>

        <Box as="main" flex={1} overflow="hidden">
          {page === 'chat' ? (
            <ChatBox
              ref={chatRef}
              conversationId={activeConvId}
              onSessionUpdate={handleSessionUpdate}
            />
          ) : (
            <KnowledgeBase />
          )}
        </Box>
      </Flex>
    </Flex>
  )
}

export default App
