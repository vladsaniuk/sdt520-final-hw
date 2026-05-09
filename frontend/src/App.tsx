import { useState } from 'react'
import {
  Box,
  Flex,
  VStack,
  HStack,
  Text,
  Button,
  Icon,
} from '@chakra-ui/react'
import { ChatBox } from './components/Chat/ChatBox'
import { KnowledgeBase } from './pages/KnowledgeBase'
import { MdAdd, MdBolt, MdOutlineArticle } from 'react-icons/md'

type Page = 'chat' | 'knowledge'

interface MockConversation {
  id: string
  title: string
  preview: string
  time: string
}

const MOCK_CONVERSATIONS: MockConversation[] = [
  { id: 'c1', title: 'Serverless e-commerce API', preview: 'Lambda + API Gateway + DynamoDB...', time: '2m ago' },
  { id: 'c2', title: 'Multi-region DR setup', preview: 'Route 53 failover with RDS Multi-AZ...', time: '1h ago' },
  { id: 'c3', title: 'ML inference pipeline', preview: 'SageMaker + S3 + Step Functions...', time: 'Yesterday' },
  { id: 'c4', title: 'Event-driven microservices', preview: 'SNS + SQS + ECS Fargate...', time: '2d ago' },
]

function App() {
  const [page, setPage] = useState<Page>('chat')
  const [activeConv, setActiveConv] = useState('c1')

  return (
    <Flex h="100vh" overflow="hidden" bg="gray.100">
      {/* Sidebar */}
      <Flex as="aside" direction="column" w="260px" flexShrink={0} bg="aws.squid" color="gray.100">
        {/* Logo */}
        <HStack px={4} py={4} borderBottom="1px solid" borderColor="aws.squidLight" spacing={3}>
          <Flex w={8} h={8} borderRadius="md" bg="aws.orange" align="center" justify="center" flexShrink={0}>
            <Icon as={MdBolt} color="aws.squid" boxSize={5} />
          </Flex>
          <Box>
            <Text fontSize="xs" fontWeight="bold" color="white" lineHeight="none">AWS</Text>
            <Text fontSize="10px" color="gray.400" lineHeight="none" mt="2px">Architecture Advisor</Text>
          </Box>
        </HStack>

        {/* New chat */}
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
            onClick={() => setPage('chat')}
          >
            New conversation
          </Button>
        </Box>

        {/* Conversations */}
        <VStack flex={1} overflowY="auto" px={2} py={3} spacing={0} align="stretch">
          <Text px={2} pb={1} fontSize="10px" fontWeight="semibold" textTransform="uppercase" letterSpacing="wider" color="gray.500">
            Recent
          </Text>
          {MOCK_CONVERSATIONS.map((c) => (
            <Box
              key={c.id}
              as="button"
              textAlign="left"
              px={3} py={2}
              borderRadius="md"
              bg={activeConv === c.id ? 'aws.squidLight' : 'transparent'}
              _hover={{ bg: activeConv === c.id ? 'aws.squidLight' : 'whiteAlpha.100' }}
              onClick={() => { setActiveConv(c.id); setPage('chat') }}
              transition="background 0.15s"
            >
              <Text fontSize="sm" color="gray.200" fontWeight="medium" noOfLines={1}>{c.title}</Text>
              <Text fontSize="11px" color="gray.500" noOfLines={1}>{c.preview}</Text>
              <Text fontSize="10px" color="gray.600" mt="1px">{c.time}</Text>
            </Box>
          ))}
          <Text px={2} pt={3} fontSize="10px" color="gray.600" fontStyle="italic">
            Full history available in Phase 3
          </Text>
        </VStack>

        {/* Footer nav */}
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

      {/* Main content */}
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

        <Box as="main" flex={1} overflow="hidden">
          {page === 'chat' ? <ChatBox /> : <KnowledgeBase />}
        </Box>
      </Flex>
    </Flex>
  )
}

export default App
