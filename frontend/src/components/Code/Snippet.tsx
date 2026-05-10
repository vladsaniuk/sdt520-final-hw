import React, { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { Box, HStack, Text, Button } from '@chakra-ui/react'

interface CodeSnippetProps {
  code: string
  language: string
}

export const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, language }) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <Box borderRadius="xl" overflow="hidden" border="1px solid" borderColor="gray.700" boxShadow="sm" my={2}>
      <HStack px={4} py={2} bg="aws.squid" justify="space-between">
        <Text fontSize="xs" fontWeight="bold" color="gray.300" fontFamily="mono" textTransform="uppercase" letterSpacing="widest">
          {language.toUpperCase()}
        </Text>
        <Button
          variant="ghost"
          size="xs"
          color={copied ? 'aws.orange' : 'gray.400'}
          _hover={{ color: 'aws.orange', bg: 'transparent' }}
          onClick={handleCopy}
          fontFamily="body"
        >
          {copied ? 'Copied!' : 'Copy code'}
        </Button>
      </HStack>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{
          margin: 0,
          padding: '1rem',
          fontFamily: "'Geist Mono', monospace",
          fontSize: '0.75rem',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </Box>
  )
}
