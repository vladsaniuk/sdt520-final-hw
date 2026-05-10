import React, { useState, useRef, useEffect } from 'react'
import {
  Box,
  Flex,
  HStack,
  VStack,
  Text,
  Button,
  Icon,
  Spinner,
  IconButton,
  Tag,
} from '@chakra-ui/react'
import { MdClose, MdContentCopy, MdDownload, MdBolt, MdAttachMoney, MdCode } from 'react-icons/md'
import { MermaidViewer } from './Diagram/MermaidViewer'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface ServiceItem {
  name: string
  description: string
  rationale: string
}

interface CostBreakdownItem {
  service: string
  cost: number
  is_calculated: boolean
}

interface CostEstimate {
  total: number
  breakdown: CostBreakdownItem[]
}

export interface ArchitecturePlanData {
  summary: string
  diagram: string
  services: ServiceItem[]
  iac_snippet?: string
  cost_estimate?: CostEstimate
}

export interface ArtifactDrawerProps {
  isOpen: boolean
  unlockedTabs: string[]
  artifacts: {
    architecture?: ArchitecturePlanData | null
    costs?: string | null
    terraform?: string | null
  }
  loadingTab: string | null
  onClose: () => void
}

type TabType = 'architecture' | 'costs' | 'terraform'

const TAB_DEFS: Array<{ id: TabType; label: string; icon: React.ElementType }> = [
  { id: 'architecture', label: 'Architecture', icon: MdBolt },
  { id: 'costs', label: 'Costs', icon: MdAttachMoney },
  { id: 'terraform', label: 'Terraform', icon: MdCode },
]

/** Very simple markdown-to-HTML renderer for cost text (headings, bold, bullets) */
function SimpleMarkdown({ text }: { text: string }) {
  const lines = text.split('\n')
  return (
    <VStack align="stretch" spacing={1} fontSize="sm" color="gray.200">
      {lines.map((line, i) => {
        if (line.startsWith('### ')) {
          return (
            <Text key={i} fontWeight="bold" color="aws.orange" mt={2} fontSize="sm">
              {line.slice(4)}
            </Text>
          )
        }
        if (line.startsWith('## ')) {
          return (
            <Text key={i} fontWeight="bold" color="white" mt={3} fontSize="md">
              {line.slice(3)}
            </Text>
          )
        }
        if (line.startsWith('# ')) {
          return (
            <Text key={i} fontWeight="bold" color="white" mt={3} fontSize="lg">
              {line.slice(2)}
            </Text>
          )
        }
        if (line.startsWith('- ') || line.startsWith('* ')) {
          return (
            <Text key={i} pl={3} color="gray.300">
              • {line.slice(2)}
            </Text>
          )
        }
        if (line.trim() === '') {
          return <Box key={i} h={2} />
        }
        // Inline bold: **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/)
        return (
          <Text key={i} color="gray.300" lineHeight="relaxed">
            {parts.map((part, j) =>
              part.startsWith('**') && part.endsWith('**') ? (
                <strong key={j} style={{ color: '#e2e8f0' }}>
                  {part.slice(2, -2)}
                </strong>
              ) : (
                part
              )
            )}
          </Text>
        )
      })}
    </VStack>
  )
}

export const ArtifactDrawer: React.FC<ArtifactDrawerProps> = ({
  isOpen,
  unlockedTabs,
  artifacts,
  loadingTab,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('architecture')
  const [tfCopied, setTfCopied] = useState(false)
  const streamRef = useRef<HTMLDivElement>(null)

  // Auto-scroll streaming content
  useEffect(() => {
    streamRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [artifacts])

  // Auto-select the newly loaded tab
  useEffect(() => {
    if (loadingTab) {
      setActiveTab(loadingTab as TabType)
    }
  }, [loadingTab])

  const handleTfCopy = () => {
    if (!artifacts.terraform) return
    navigator.clipboard.writeText(artifacts.terraform)
    setTfCopied(true)
    setTimeout(() => setTfCopied(false), 2000)
  }

  const handleTfDownload = () => {
    if (!artifacts.terraform) return
    const blob = new Blob([artifacts.terraform], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'main.tf'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <>
      {/* Slide-in transition via inline style */}
      <style>{`
        .artifact-drawer {
          transition: transform 0.25s cubic-bezier(0.4,0,0.2,1), opacity 0.25s ease;
        }
        .artifact-drawer.closed {
          transform: translateX(100%);
          opacity: 0;
          pointer-events: none;
        }
        .artifact-drawer.open {
          transform: translateX(0);
          opacity: 1;
        }
      `}</style>

      <Box
        className={`artifact-drawer ${isOpen ? 'open' : 'closed'}`}
        w={{ base: '100%', md: '40vw' }}
        minW="320px"
        maxW="600px"
        bg="gray.900"
        borderLeft="1px solid"
        borderColor="gray.700"
        display="flex"
        flexDirection="column"
        h="full"
        flexShrink={0}
        overflow="hidden"
      >
        {/* Header */}
        <HStack
          px={4}
          py={3}
          bg="aws.squid"
          borderBottom="1px solid"
          borderColor="aws.squidLight"
          justify="space-between"
          flexShrink={0}
        >
          <Text fontSize="sm" fontWeight="bold" color="white">
            Generated Artifacts
          </Text>
          <IconButton
            aria-label="Close drawer"
            icon={<Icon as={MdClose} />}
            size="xs"
            variant="ghost"
            color="gray.400"
            _hover={{ color: 'white', bg: 'aws.squidLight' }}
            onClick={onClose}
          />
        </HStack>

        {/* Tabs */}
        <HStack
          px={2}
          pt={2}
          pb={0}
          bg="aws.squid"
          borderBottom="1px solid"
          borderColor="aws.squidLight"
          spacing={0}
          flexShrink={0}
        >
          {TAB_DEFS.map(({ id, label, icon }) => {
            const isActive = activeTab === id
            const isUnlocked = unlockedTabs.includes(id)
            const isLoading = loadingTab === id

            return (
              <button
                key={id}
                onClick={() => isUnlocked && setActiveTab(id)}
                disabled={!isUnlocked}
                style={{
                  padding: '8px 14px',
                  fontSize: '12px',
                  fontWeight: isActive ? 700 : 500,
                  color: !isUnlocked ? '#4A5568' : isActive ? '#FF9900' : '#A0AEC0',
                  borderBottom: isActive ? '2px solid #FF9900' : '2px solid transparent',
                  background: 'transparent',
                  border: 'none',
                  borderBottomWidth: '2px',
                  borderBottomStyle: 'solid',
                  borderBottomColor: isActive ? '#FF9900' : 'transparent',
                  cursor: isUnlocked ? 'pointer' : 'not-allowed',
                  opacity: !isUnlocked ? 0.5 : 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  transition: 'color 0.15s',
                }}
              >
                {isLoading ? (
                  <Spinner size="xs" color="aws.orange" />
                ) : (
                  <Icon as={icon} boxSize={3} />
                )}
                {label}
              </button>
            )
          })}
        </HStack>

        {/* Tab content */}
        <Box flex={1} overflowY="auto" p={4}>
          {/* Architecture Tab */}
          {activeTab === 'architecture' && (
            <VStack spacing={4} align="stretch">
              {loadingTab === 'architecture' && !artifacts.architecture && (
                <Flex align="center" justify="center" py={12} gap={3}>
                  <Spinner size="md" color="aws.orange" />
                  <Text color="gray.400" fontSize="sm">Generating architecture…</Text>
                </Flex>
              )}

              {artifacts.architecture && (
                <>
                  {/* Summary */}
                  {artifacts.architecture.summary && (
                    <Box
                      bg="gray.800"
                      border="1px solid"
                      borderColor="gray.700"
                      borderRadius="lg"
                      p={3}
                    >
                      <Text fontSize="xs" fontWeight="bold" color="aws.orange" mb={1} textTransform="uppercase" letterSpacing="wide">
                        Summary
                      </Text>
                      <Text fontSize="sm" color="gray.300" lineHeight="relaxed">
                        {artifacts.architecture.summary}
                      </Text>
                    </Box>
                  )}

                  {/* Mermaid diagram */}
                  {artifacts.architecture.diagram && (
                    <Box>
                      <Text fontSize="xs" fontWeight="bold" color="aws.orange" mb={2} textTransform="uppercase" letterSpacing="wide">
                        Architecture Diagram
                      </Text>
                      <MermaidViewer definition={artifacts.architecture.diagram} />
                    </Box>
                  )}

                  {/* Services list */}
                  {artifacts.architecture.services && artifacts.architecture.services.length > 0 && (
                    <Box>
                      <Text fontSize="xs" fontWeight="bold" color="aws.orange" mb={2} textTransform="uppercase" letterSpacing="wide">
                        AWS Services ({artifacts.architecture.services.length})
                      </Text>
                      <VStack spacing={2} align="stretch">
                        {artifacts.architecture.services.map((svc, i) => (
                          <Box
                            key={i}
                            bg="gray.800"
                            border="1px solid"
                            borderColor="gray.700"
                            borderRadius="md"
                            p={3}
                          >
                            <HStack mb={1}>
                              <Tag size="sm" bg="aws.orange" color="aws.squid" fontWeight="bold" fontSize="11px">
                                {svc.name}
                              </Tag>
                            </HStack>
                            <Text fontSize="xs" color="gray.400" lineHeight="relaxed">
                              {svc.description}
                            </Text>
                            {svc.rationale && (
                              <Text fontSize="xs" color="gray.500" mt={1} fontStyle="italic">
                                Why: {svc.rationale}
                              </Text>
                            )}
                          </Box>
                        ))}
                      </VStack>
                    </Box>
                  )}
                </>
              )}

              {!loadingTab && !artifacts.architecture && (
                <Flex align="center" justify="center" py={12}>
                  <Text color="gray.600" fontSize="sm" textAlign="center">
                    Click "⚡ Generate Architecture" to create your architecture plan.
                  </Text>
                </Flex>
              )}
            </VStack>
          )}

          {/* Costs Tab */}
          {activeTab === 'costs' && (
            <Box>
              {loadingTab === 'costs' && !artifacts.costs && (
                <Flex align="center" justify="center" py={12} gap={3}>
                  <Spinner size="md" color="green.400" />
                  <Text color="gray.400" fontSize="sm">Generating cost estimate…</Text>
                </Flex>
              )}

              {artifacts.costs && (
                <Box>
                  <Text fontSize="xs" fontWeight="bold" color="green.400" mb={3} textTransform="uppercase" letterSpacing="wide">
                    Cost Estimate
                  </Text>
                  <SimpleMarkdown text={artifacts.costs} />
                  <Box ref={streamRef} />
                </Box>
              )}

              {!loadingTab && !artifacts.costs && (
                <Flex align="center" justify="center" py={12}>
                  <Text color="gray.600" fontSize="sm" textAlign="center">
                    Generate the architecture first, then click "💰 Generate Costs".
                  </Text>
                </Flex>
              )}
            </Box>
          )}

          {/* Terraform Tab */}
          {activeTab === 'terraform' && (
            <Box>
              {loadingTab === 'terraform' && !artifacts.terraform && (
                <Flex align="center" justify="center" py={12} gap={3}>
                  <Spinner size="md" color="blue.400" />
                  <Text color="gray.400" fontSize="sm">Generating Terraform…</Text>
                </Flex>
              )}

              {artifacts.terraform && (
                <Box>
                  <HStack justify="space-between" mb={3}>
                    <Text fontSize="xs" fontWeight="bold" color="blue.400" textTransform="uppercase" letterSpacing="wide">
                      Terraform HCL
                    </Text>
                    <HStack spacing={2}>
                      <Button
                        size="xs"
                        leftIcon={<Icon as={MdContentCopy} />}
                        variant="ghost"
                        color={tfCopied ? 'aws.orange' : 'gray.400'}
                        _hover={{ color: 'aws.orange', bg: 'whiteAlpha.100' }}
                        onClick={handleTfCopy}
                      >
                        {tfCopied ? 'Copied!' : 'Copy'}
                      </Button>
                      <Button
                        size="xs"
                        leftIcon={<Icon as={MdDownload} />}
                        variant="ghost"
                        color="gray.400"
                        _hover={{ color: 'blue.300', bg: 'whiteAlpha.100' }}
                        onClick={handleTfDownload}
                      >
                        Download main.tf
                      </Button>
                    </HStack>
                  </HStack>
                  <Box borderRadius="lg" overflow="hidden" border="1px solid" borderColor="gray.700">
                    <SyntaxHighlighter
                      language="hcl"
                      style={vscDarkPlus}
                      customStyle={{
                        margin: 0,
                        padding: '1rem',
                        fontFamily: "'Geist Mono', monospace",
                        fontSize: '0.72rem',
                        maxHeight: '60vh',
                        overflow: 'auto',
                      }}
                    >
                      {artifacts.terraform}
                    </SyntaxHighlighter>
                  </Box>
                  <Box ref={streamRef} />
                </Box>
              )}

              {!loadingTab && !artifacts.terraform && (
                <Flex align="center" justify="center" py={12}>
                  <Text color="gray.600" fontSize="sm" textAlign="center">
                    Generate costs first, then click "🏗 Generate Terraform".
                  </Text>
                </Flex>
              )}
            </Box>
          )}
        </Box>
      </Box>
    </>
  )
}
