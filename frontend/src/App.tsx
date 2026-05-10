import { useState, useRef, useCallback, useEffect } from 'react'
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
import { MdAdd, MdBolt, MdOutlineArticle, MdCompress, MdClear, MdDeleteOutline } from 'react-icons/md'
import { ActionBar } from './components/ActionBar'
import type { GenerateType } from './components/ActionBar'
import { ArtifactDrawer } from './components/ArtifactDrawer'
import type { ArchitecturePlanData } from './components/ArtifactDrawer'
import type { DebugEvent, DebugInfo } from './components/Drawer/DebugTab'

type Page = 'chat' | 'knowledge'

interface Session {
  id: string
  title: string
  turnCount: number
  updatedAt: number
  state?: string  // 'gathering' | 'presenting' | 'complete'
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

  // ActionBar + ArtifactDrawer state
  const [unlockedButtons, setUnlockedButtons] = useState<GenerateType[]>([])
  const [staleButtons, setStaleButtons] = useState<GenerateType[]>([])
  const [loadingButton, setLoadingButton] = useState<GenerateType | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(() => {
    return localStorage.getItem('debugDrawerOpen') === 'true'
  })
  const [loadingTab, setLoadingTab] = useState<string | null>(null)
  const [artifacts, setArtifacts] = useState<{
    architecture?: ArchitecturePlanData | null
    costs?: string | null
    terraform?: string | null
  }>({})

  // Debug state
  const [debugEvents, setDebugEvents] = useState<DebugEvent[]>([])
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null)
  // Load conversations from backend DB on mount for sidebar restore
  useEffect(() => {
    const lastConvId = localStorage.getItem('aws_advisor_conv_id')
    // Set active conversation immediately from localStorage so ChatBox
    // doesn't diverge from App state on first render
    if (lastConvId) setActiveConvId(lastConvId)

    fetch('/api/v1/conversations')
      .then(r => r.json())
      .then((convs: Array<{ id: string; state: string; title: string; updated_at: number }>) => {
        if (!Array.isArray(convs)) return
        const loaded: Session[] = convs.map(c => ({
          id: c.id,
          title: c.title || 'New conversation',
          turnCount: 0,
          updatedAt: c.updated_at,
          state: c.state,
        }))
        setSessions(prev => {
          // Merge: keep any sessions ChatBox already reported, add DB ones
          const merged = [...loaded]
          for (const s of prev) {
            if (!merged.find(m => m.id === s.id)) merged.push(s)
          }
          return merged
        })
        // Only switch active conversation if nothing is set yet
        if (!lastConvId && loaded.length > 0) {
          setActiveConvId(loaded[0].id)
        }
      })
      .catch(() => {/* backend not yet ready — start fresh */})
  }, [])

  // Reset drawer/artifacts when active conversation changes, then restore from backend
  useEffect(() => {
    setUnlockedButtons([])
    setStaleButtons([])
    setArtifacts({})
    setLoadingButton(null)
    setLoadingTab(null)
    setDebugEvents([])

    if (!activeConvId) return

    // Restore button/artifact state from backend
    fetch(`/api/v1/conversations/${activeConvId}/context`)
      .then(r => r.ok ? r.json() : null)
      .then((ctx: { state: string; artifacts: Record<string, string> } | null) => {
        if (!ctx) return
        const { state, artifacts: arts } = ctx

        // Unlock buttons based on conversation state
        const unlocked: GenerateType[] = []
        if (state === 'architecture_ready' || state === 'presenting' || state === 'costs_ready' || state === 'terraform_ready' || state === 'complete') {
          unlocked.push('architecture')
        }
        if (state === 'costs_ready' || state === 'terraform_ready' || state === 'complete') {
          unlocked.push('costs')
        }
        if (state === 'terraform_ready' || state === 'complete') {
          unlocked.push('terraform')
        }
        if (unlocked.length > 0) setUnlockedButtons(unlocked)

        // Restore artifact content
        const restored: typeof artifacts = {}
        if (arts.architecture) {
          try { restored.architecture = JSON.parse(arts.architecture) } catch { restored.architecture = arts.architecture as unknown as ArchitecturePlanData }
        }
        if (arts.costs) restored.costs = arts.costs
        if (arts.terraform) restored.terraform = arts.terraform
        if (Object.keys(restored).length > 0) {
          setArtifacts(restored)
          setDrawerOpen(true)
          localStorage.setItem('debugDrawerOpen', 'true')
        }
      })
      .catch(() => {})
  }, [activeConvId])

  // Fetch debug info whenever active conversation changes
  useEffect(() => {
    fetch('/api/v1/debug/info')
      .then(r => r.json())
      .then((data: DebugInfo) => setDebugInfo(data))
      .catch(() => {})
  }, [activeConvId])

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
        return [{ id, title, turnCount, updatedAt, state: 'gathering' }, ...prev]
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

  const hasMessages = chatRef.current?.hasMessages() ?? false

  // ActionBar: unlock signal from ChatBox SSE done event
  const handleUnlock = useCallback((types: string[]) => {
    setUnlockedButtons(prev => {
      const next = [...prev]
      for (const t of types as GenerateType[]) {
        if (!next.includes(t)) next.push(t)
      }
      return next
    })
    // Remove from stale if re-unlocked
    setStaleButtons(prev => prev.filter(t => !types.includes(t)))
  }, [])

  // ActionBar: stale signal from ChatBox SSE done event
  const handleStale = useCallback((types: string[]) => {
    setStaleButtons(prev => {
      const next = [...prev]
      for (const t of types as GenerateType[]) {
        if (!next.includes(t)) next.push(t)
      }
      return next
    })
  }, [])

  // SSE stream reader for generate endpoints
  const streamGenerateSSE = useCallback(
    async (type: GenerateType, convId: string) => {
      setLoadingButton(type)
      setLoadingTab(type)
      setDrawerOpen(true)
      localStorage.setItem('debugDrawerOpen', 'true')

      try {
        const response = await fetch(`/api/v1/generate/${type}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation_id: convId }),
        })

        if (!response.ok || !response.body) {
          throw new Error(`HTTP ${response.status}`)
        }

        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let accumulatedText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

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
              accumulatedText += (event.content as string)
              // Update streaming content in drawer
              if (type === 'costs') {
                setArtifacts(prev => ({ ...prev, costs: accumulatedText }))
              } else if (type === 'terraform') {
                setArtifacts(prev => ({ ...prev, terraform: accumulatedText }))
              }
              // Architecture tokens don't update incrementally (JSON parse needed at end)
            } else if (event.type === 'debug' || event.type === 'rag') {
              setDebugEvents(prev => [...prev, {
                timestamp: new Date().toISOString(),
                type: String(event.type),
                payload: event,
              }])
            } else if (event.type === 'done') {
              const payload = event.payload as Record<string, unknown>
              const readyFor = event.ready_for as string[] | undefined

              if (type === 'architecture') {
                setArtifacts(prev => ({
                  ...prev,
                  architecture: payload as unknown as ArchitecturePlanData,
                }))
              } else if (type === 'costs') {
                setArtifacts(prev => ({ ...prev, costs: payload.content as string }))
              } else if (type === 'terraform') {
                setArtifacts(prev => ({ ...prev, terraform: payload.content as string }))
              }

              // Unlock next step
              if (readyFor && readyFor.length > 0) {
                handleUnlock(readyFor)
              }
              // Remove this type from stale
              setStaleButtons(prev => prev.filter(t => t !== type))
              toast({
                title: `${type.charAt(0).toUpperCase() + type.slice(1)} generated`,
                status: 'success',
                duration: 3000,
                isClosable: true,
                position: 'bottom',
              })

            } else if (event.type === 'error') {
              toast({
                title: `${type} generation failed`,
                description: String(event.message),
                status: 'error',
                duration: 5000,
                isClosable: true,
                position: 'bottom',
              })
            }
          }
        }
      } catch (err) {
        toast({
          title: `Failed to generate ${type}`,
          description: 'Please try again.',
          status: 'error',
          duration: 4000,
          isClosable: true,
          position: 'bottom',
        })
      } finally {
        setLoadingButton(null)
        setLoadingTab(null)
      }
    },
    [handleUnlock, toast]
  )

  const handleGenerate = useCallback(
    (type: GenerateType) => {
      if (!activeConvId) return
      streamGenerateSSE(type, activeConvId)
    },
    [activeConvId, streamGenerateSSE]
  )

  // Reset drawer/artifacts when switching conversation
  const handleNewConversationWithReset = useCallback(() => {
    const newId = crypto.randomUUID()
    setActiveConvId(newId)
    setPage('chat')
    setClearConfirming(false)
    setUnlockedButtons([])
    setStaleButtons([])
    setArtifacts({})
  }, [])

  const handleDeleteConversation = useCallback(async (convId: string, isEmpty: boolean) => {
    if (!isEmpty) {
      const confirmed = window.confirm('Delete this conversation? This cannot be undone.')
      if (!confirmed) return
    }
    try {
      await fetch(`/api/v1/conversations/${convId}`, { method: 'DELETE' })
      setSessions(prev => prev.filter(s => s.id !== convId))
      if (activeConvId === convId) {
        setSessions(prev => {
          const remaining = prev.filter(s => s.id !== convId)
          const nextId = remaining[0]?.id ?? crypto.randomUUID()
          setActiveConvId(nextId)
          return remaining
        })
      }
      if (!isEmpty) {
        toast({ title: 'Conversation deleted', status: 'success', duration: 3000, isClosable: true, position: 'bottom' })
      }
    } catch {
      toast({ title: 'Failed to delete conversation', status: 'error', duration: 4000, isClosable: true, position: 'bottom' })
    }
  }, [activeConvId, toast])

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
            onClick={handleNewConversationWithReset}
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
                position="relative"
                role="group"
                borderRadius="md"
                bg={activeConvId === s.id ? 'aws.squidLight' : 'transparent'}
                _hover={{ bg: activeConvId === s.id ? 'aws.squidLight' : 'whiteAlpha.100' }}
                transition="background 0.15s"
              >
                <Box
                  as="button"
                  textAlign="left"
                  px={3} py={2} pr={8}
                  w="100%"
                  onClick={() => { setActiveConvId(s.id); setPage('chat') }}
                >
                  <Text fontSize="sm" color="gray.200" fontWeight="medium" noOfLines={1}>
                    {s.title}
                  </Text>
                  <Text fontSize="11px" color="gray.500" noOfLines={1}>
                    {s.state === 'complete' ? '✅ ' : s.state === 'presenting' ? '📐 ' : '💬 '}
                    {s.turnCount > 0 ? `${s.turnCount} turn${s.turnCount !== 1 ? 's' : ''} · ` : ''}
                    {getRelativeTime(s.updatedAt)}
                  </Text>
                </Box>
                <Box
                  as="button"
                  position="absolute"
                  right={1} top="50%"
                  transform="translateY(-50%)"
                  opacity={0}
                  _groupHover={{ opacity: 1 }}
                  transition="opacity 0.15s"
                  p={1}
                  borderRadius="sm"
                  color="gray.500"
                  _hover={{ color: 'red.400', bg: 'whiteAlpha.100' }}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation()
                    handleDeleteConversation(s.id, s.turnCount === 0)
                  }}
                  aria-label="Delete conversation"
                >
                  <Icon as={MdDeleteOutline} boxSize={4} />
                </Box>
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

      {/* Main content — chat + artifact drawer */}
      <Flex flex={1} direction="column" minW={0} overflow="hidden">
        {/* Top bar */}
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

        {/* Chat + Drawer row */}
        <Flex flex={1} overflow="hidden">
          {/* Chat column */}
          <Flex
            direction="column"
            flex={drawerOpen ? '1 1 60%' : '1 1 100%'}
            minW={0}
            overflow="hidden"
            transition="flex 0.25s ease"
          >
            {/* ActionBar — only show on chat page */}
            {page === 'chat' && (
              <ActionBar
                unlockedButtons={unlockedButtons}
                staleButtons={staleButtons}
                loadingButton={loadingButton}
                onGenerate={handleGenerate}
              />
            )}

            <Box as="main" flex={1} overflow="hidden">
              {page === 'chat' ? (
                <ChatBox
                  ref={chatRef}
                  conversationId={activeConvId}
                  onSessionUpdate={handleSessionUpdate}
                  onUnlock={handleUnlock}
                  onStale={handleStale}
                  onDebugEvent={(event) => setDebugEvents(prev => [...prev, event])}
                />
              ) : (
                <KnowledgeBase />
              )}
            </Box>
          </Flex>

          {/* Artifact Drawer — always mounted, slides in/out */}
          <ArtifactDrawer
            isOpen={drawerOpen}
            unlockedTabs={unlockedButtons}
            artifacts={artifacts}
            loadingTab={loadingTab}
            onClose={() => { setDrawerOpen(false); localStorage.setItem('debugDrawerOpen', 'false') }}
            debugEvents={debugEvents}
            debugInfo={debugInfo}
          />
        </Flex>
      </Flex>
    </Flex>
  )
}

export default App
