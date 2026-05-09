import React from 'react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'

interface CodeSnippetProps {
  code: string
  language: string
}

export const CodeSnippet: React.FC<CodeSnippetProps> = ({ code, language }) => {
  return (
    <div className="rounded-md overflow-hidden text-sm my-2">
      <div className="bg-gray-800 text-gray-400 px-4 py-1 text-xs font-mono flex justify-between items-center">
        <span>{language.toUpperCase()}</span>
        <button 
          onClick={() => navigator.clipboard.writeText(code)}
          className="hover:text-white transition-colors"
        >
          Copy
        </button>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{ margin: 0, padding: '1rem' }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  )
}
