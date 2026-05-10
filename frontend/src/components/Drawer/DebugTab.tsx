import React, { useEffect, useRef, useState } from 'react'
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Code,
  Flex,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from '@chakra-ui/react'

export interface DebugEvent {
  timestamp: string // ISO
  type: string      // 'token' | 'status' | 'done' | 'debug' | 'error' | 'user' | 'ai'
  payload: Record<string, unknown>
}

export interface DebugInfo {
  model: { name: string; provider: string; base_url: string }
  neo4j: { connected: boolean; uri: string; node_count: number }
  sqlite: { path: string; conversation_count: number }
  prompts: { gather: string; followup?: string; advisor: string | Record<string, any>; terraform: string }
  env: { llm_api_key_set: boolean; neo4j_uri: string }
}

interface DebugTabProps {
  events: DebugEvent[]
  info: DebugInfo | null
}

// A display item is either a single non-token event or a group of tokens
type LogItem =
  | { kind: 'event'; event: DebugEvent; originalIndex: number }
  | { kind: 'token-group'; tokens: DebugEvent[]; startIndex: number; text: string }

function groupEvents(events: DebugEvent[]): LogItem[] {
  const items: LogItem[] = []
  let i = 0
  while (i < events.length) {
    if (events[i].type === 'token') {
      const group: DebugEvent[] = []
      while (i < events.length && events[i].type === 'token') {
        group.push(events[i])
        i++
      }
      const text = group.map(e => (e.payload.content as string) ?? '').join('')
      items.push({ kind: 'token-group', tokens: group, startIndex: i - group.length, text })
    } else {
      items.push({ kind: 'event', event: events[i], originalIndex: i })
      i++
    }
  }
  return items
}

function extractTime(iso: string): string {
  try {
    const d = new Date(iso)
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    const ss = String(d.getSeconds()).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  } catch {
    return '--:--:--'
  }
}

function typeBadgeColor(type: string): string {
  switch (type) {
    case 'token': return 'gray'
    case 'user': return 'blue'
    case 'ai':
    case 'status': return 'green'
    case 'debug': return 'orange'
    case 'error': return 'red'
    case 'done': return 'purple'
    default: return 'gray'
  }
}

function payloadPreview(event: DebugEvent): string {
  if (event.type === 'token') {
    const content = (event.payload.content as string) ?? ''
    return content.slice(0, 80)
  }
  if (event.type === 'debug') {
    return String(event.payload.event ?? '')
  }
  return JSON.stringify(event.payload).slice(0, 100)
}

export const DebugTab: React.FC<DebugTabProps> = ({ events, info }) => {
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const logEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const items = groupEvents(events)
  const totalDisplayed = items.length
  const tokenCount = events.filter(e => e.type === 'token').length

  return (
    <VStack spacing={0} align="stretch" h="full">
      {/* ── Section 1: System Info ── */}
      <Box
        px={3}
        py={3}
        bg="gray.800"
        borderBottom="1px solid"
        borderColor="gray.700"
        flexShrink={0}
      >
        <Text fontSize="10px" fontWeight="bold" color="gray.500" textTransform="uppercase" letterSpacing="widest" mb={2}>
          System Info
        </Text>
        {info ? (
          <VStack spacing={1} align="stretch">
            <HStack spacing={2} fontSize="xs">
              <Text color="gray.400" minW="16">Model</Text>
              <Text color="gray.200" flex={1} noOfLines={1}>{info.model.name}</Text>
              <Badge colorScheme="green" fontSize="10px">via {info.model.provider}</Badge>
            </HStack>
            <HStack spacing={2} fontSize="xs">
              <Text color="gray.400" minW="16">Neo4j</Text>
              {info.neo4j.connected ? (
                <>
                  <Text color="gray.200">✅ Connected ({info.neo4j.node_count} nodes)</Text>
                  <Badge colorScheme="green" fontSize="10px">OK</Badge>
                </>
              ) : (
                <>
                  <Text color="gray.200">❌ Disconnected</Text>
                  <Badge colorScheme="red" fontSize="10px">Down</Badge>
                </>
              )}
            </HStack>
            <HStack spacing={2} fontSize="xs">
              <Text color="gray.400" minW="16">SQLite</Text>
              <Text color="gray.200" noOfLines={1}>{info.sqlite.path}</Text>
              <Text color="gray.500">·</Text>
              <Text color="gray.400">{info.sqlite.conversation_count} convs</Text>
            </HStack>
            <HStack spacing={2} fontSize="xs">
              <Text color="gray.400" minW="16">API Key</Text>
              {info.env.llm_api_key_set ? (
                <Text color="green.400">✅ Set</Text>
              ) : (
                <Text color="red.400">❌ Missing</Text>
              )}
            </HStack>
          </VStack>
        ) : (
          <Text fontSize="xs" color="gray.600">Loading system info…</Text>
        )}
      </Box>

      {/* ── Section 2: Prompts ── */}
      {info && (
        <Box flexShrink={0} borderBottom="1px solid" borderColor="gray.700">
          <Accordion allowToggle>
            <AccordionItem border="none">
              <AccordionButton
                px={3} py={2}
                bg="gray.800"
                _hover={{ bg: 'gray.700' }}
                _expanded={{ bg: 'gray.750' }}
              >
                <Box flex={1} textAlign="left">
                  <Text fontSize="10px" fontWeight="bold" color="gray.500" textTransform="uppercase" letterSpacing="widest">
                    Prompts
                  </Text>
                </Box>
                <AccordionIcon color="gray.500" />
              </AccordionButton>
              <AccordionPanel p={0} bg="gray.850">
                <Accordion allowToggle>
                  <AccordionItem border="none" borderBottom="1px solid" borderColor="gray.700">
                    <AccordionButton px={3} py={2} bg="gray.800" _hover={{ bg: 'gray.700' }}>
                      <Box flex={1} textAlign="left">
                        <Text fontSize="xs" color="gray.400">Gather Prompt</Text>
                      </Box>
                      <AccordionIcon color="gray.500" />
                    </AccordionButton>
                    <AccordionPanel pb={2} px={3} bg="gray.900" maxH="200px" overflowY="auto">
                      <Code whiteSpace="pre-wrap" fontSize="xs" display="block" bg="transparent" color="gray.300">
                        {info.prompts.gather}
                      </Code>
                    </AccordionPanel>
                  </AccordionItem>
                  {info.prompts.followup && (
                    <AccordionItem border="none" borderBottom="1px solid" borderColor="gray.700">
                      <AccordionButton px={3} py={2} bg="gray.800" _hover={{ bg: 'gray.700' }}>
                        <Box flex={1} textAlign="left">
                          <Text fontSize="xs" color="gray.400">Follow-up Prompt</Text>
                        </Box>
                        <AccordionIcon color="gray.500" />
                      </AccordionButton>
                      <AccordionPanel pb={2} px={3} bg="gray.900" maxH="200px" overflowY="auto">
                        <Code whiteSpace="pre-wrap" fontSize="xs" display="block" bg="transparent" color="gray.300">
                          {info.prompts.followup}
                        </Code>
                      </AccordionPanel>
                    </AccordionItem>
                  )}
                  <AccordionItem border="none" borderBottom="1px solid" borderColor="gray.700">
                    <AccordionButton px={3} py={2} bg="gray.800" _hover={{ bg: 'gray.700' }}>
                      <Box flex={1} textAlign="left">
                        <Text fontSize="xs" color="gray.400">Advisor Prompt</Text>
                      </Box>
                      <AccordionIcon color="gray.500" />
                    </AccordionButton>
                    <AccordionPanel pb={2} px={3} bg="gray.900" maxH="200px" overflowY="auto">
                      <Code whiteSpace="pre-wrap" fontSize="xs" display="block" bg="transparent" color="gray.300">
                        {typeof info.prompts.advisor === 'string'
                          ? info.prompts.advisor
                          : (info.prompts.advisor as any).template ?? JSON.stringify(info.prompts.advisor, null, 2)}
                      </Code>
                    </AccordionPanel>
                  </AccordionItem>
                  <AccordionItem border="none">
                    <AccordionButton px={3} py={2} bg="gray.800" _hover={{ bg: 'gray.700' }}>
                      <Box flex={1} textAlign="left">
                        <Text fontSize="xs" color="gray.400">Terraform Prompt</Text>
                      </Box>
                      <AccordionIcon color="gray.500" />
                    </AccordionButton>
                    <AccordionPanel pb={2} px={3} bg="gray.900" maxH="200px" overflowY="auto">
                      <Code whiteSpace="pre-wrap" fontSize="xs" display="block" bg="transparent" color="gray.300">
                        {info.prompts.terraform}
                      </Code>
                    </AccordionPanel>
                  </AccordionItem>
                </Accordion>
              </AccordionPanel>
            </AccordionItem>
          </Accordion>
        </Box>
      )}

      {/* ── Section 3: Event Log ── */}
      <Box flex={1} overflowY="auto" bg="gray.900" fontFamily="monospace">
        <Box px={2} pt={2} pb={1} borderBottom="1px solid" borderColor="gray.800" flexShrink={0}>
          <HStack spacing={2}>
            <Text fontSize="10px" fontWeight="bold" color="gray.500" textTransform="uppercase" letterSpacing="widest">
              Event Log
            </Text>
            <Badge colorScheme="gray" fontSize="9px">{totalDisplayed} items</Badge>
            {tokenCount > 0 && (
              <Badge colorScheme="gray" fontSize="9px" variant="outline">{tokenCount} tokens grouped</Badge>
            )}
          </HStack>
        </Box>
        {items.length === 0 ? (
          <Flex align="center" justify="center" py={8}>
            <Text fontSize="xs" color="gray.600">No events yet — send a message to see the log.</Text>
          </Flex>
        ) : (
          <VStack spacing={0} align="stretch" py={1}>
            {items.map((item, i) => {
              const key = String(i)
              const isExpanded = expandedKey === key

              if (item.kind === 'token-group') {
                return (
                  <Box key={key}>
                    <HStack
                      px={2}
                      py={1}
                      spacing={2}
                      cursor="pointer"
                      _hover={{ bg: 'gray.800' }}
                      onClick={() => setExpandedKey(isExpanded ? null : key)}
                      align="flex-start"
                    >
                      <Text fontSize="10px" color="gray.600" flexShrink={0} pt="1px">
                        [{extractTime(item.tokens[0].timestamp)}]
                      </Text>
                      <Badge colorScheme="gray" fontSize="9px" flexShrink={0} mt="1px" textTransform="lowercase">
                        tokens ×{item.tokens.length}
                      </Badge>
                      <Text fontSize="11px" color="gray.500" noOfLines={1} flex={1}>
                        {item.text.slice(0, 80)}{item.text.length > 80 ? '…' : ''}
                      </Text>
                      <Text fontSize="10px" color="gray.600" flexShrink={0}>
                        {isExpanded ? '▲' : '▼'}
                      </Text>
                    </HStack>
                    {isExpanded && (
                      <Box px={2} pb={2} bg="gray.800">
                        <Code
                          display="block"
                          whiteSpace="pre-wrap"
                          fontSize="10px"
                          color="gray.300"
                          bg="transparent"
                        >
                          {item.text}
                        </Code>
                      </Box>
                    )}
                  </Box>
                )
              }

              // Regular single event
              const evt = item.event
              return (
                <Box key={key}>
                  <HStack
                    px={2}
                    py={1}
                    spacing={2}
                    cursor="pointer"
                    _hover={{ bg: 'gray.800' }}
                    onClick={() => setExpandedKey(isExpanded ? null : key)}
                    align="flex-start"
                  >
                    <Text fontSize="10px" color="gray.600" flexShrink={0} pt="1px" fontFamily="monospace">
                      [{extractTime(evt.timestamp)}]
                    </Text>
                    <Badge
                      colorScheme={typeBadgeColor(evt.type)}
                      fontSize="9px"
                      flexShrink={0}
                      mt="1px"
                      textTransform="lowercase"
                    >
                      {evt.type}
                    </Badge>
                    <Text fontSize="11px" color="gray.400" noOfLines={1} flex={1} fontFamily="monospace">
                      {payloadPreview(evt)}
                    </Text>
                  </HStack>
                  {isExpanded && (
                    <Box px={2} pb={2} bg="gray.800">
                      <Code
                        display="block"
                        whiteSpace="pre-wrap"
                        fontSize="10px"
                        color="gray.300"
                        bg="transparent"
                        overflowX="auto"
                      >
                        {JSON.stringify(evt.payload, null, 2)}
                      </Code>
                    </Box>
                  )}
                </Box>
              )
            })}
            <Box ref={logEndRef} />
          </VStack>
        )}
      </Box>
    </VStack>
  )
}

