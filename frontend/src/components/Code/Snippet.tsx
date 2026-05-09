import React, { useState } from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

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
    <div className="rounded-xl overflow-hidden border border-gray-700 shadow-sm my-2">
      {/* Header bar */}
      <div className="bg-aws-squid px-4 py-2 flex justify-between items-center">
        <span className="text-xs font-bold text-gray-300 font-mono uppercase tracking-widest">
          {language.toUpperCase()}
        </span>
        <button
          onClick={handleCopy}
          className="text-xs text-gray-400 hover:text-aws-orange transition-colors font-sans"
        >
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>
      {/* Code body */}
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
    </div>
  )
}
