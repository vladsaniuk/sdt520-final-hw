import React, { useState, useRef, useEffect } from 'react'
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

// Demo data — shows all UI panels so you can see everything in action
// Real responses come from /api/v1/chat once Phase 3 is wired
const DEMO_MESSAGES: Message[] = [
  {
    role: 'user',
    content: 'I need a serverless e-commerce API: product catalog, cart, checkout. Must be highly available across 2 regions. Budget ~$500/month.',
  },
  {
    role: 'assistant',
    content: `Here's a recommended serverless e-commerce architecture on AWS, optimized for high availability across 2 regions within your $500/month budget.

**Core services:**
- **API Gateway** (Regional) + **Lambda** — stateless compute, auto-scales to zero
- **DynamoDB Global Tables** — active-active replication across us-east-1 / eu-west-1
- **ElastiCache (Redis)** — session & cart caching, reduces DynamoDB reads
- **S3 + CloudFront** — product images & static assets with global CDN

**Reliability pattern:** Route 53 latency-based routing with health checks → automatic failover if one region degrades. DynamoDB conflict resolution uses "last writer wins" (suitable for cart merges).

**Security:** Cognito User Pools for auth, WAF on API Gateway, KMS-managed encryption at rest.`,
    diagram: `graph LR
    User(["👤 User"])
    R53["Route 53\nLatency Routing"]
    APIGW1["API Gateway\nus-east-1"]
    APIGW2["API Gateway\neu-west-1"]
    L1["Lambda\nFunctions"]
    L2["Lambda\nFunctions"]
    DDB["DynamoDB\nGlobal Tables"]
    Cache["ElastiCache\nRedis"]
    CF["CloudFront\n+ S3"]

    User --> R53
    R53 --> APIGW1 & APIGW2
    APIGW1 --> L1
    APIGW2 --> L2
    L1 & L2 --> DDB
    L1 & L2 --> Cache
    User --> CF`,
    iac: [
      {
        type: 'terraform',
        content: `# DynamoDB Global Table — active-active, 2 regions
resource "aws_dynamodb_table" "products" {
  name             = "products"
  billing_mode     = "PAY_PER_REQUEST"
  hash_key         = "productId"
  stream_enabled   = true
  stream_view_type = "NEW_AND_OLD_IMAGES"

  attribute {
    name = "productId"
    type = "S"
  }

  replica {
    region_name = "eu-west-1"
  }

  tags = { Environment = "production" }
}

# Lambda function — product catalog handler
resource "aws_lambda_function" "catalog" {
  function_name = "ecom-catalog"
  runtime       = "nodejs20.x"
  handler       = "index.handler"
  role          = aws_iam_role.lambda_exec.arn
  filename      = "catalog.zip"

  environment {
    variables = {
      TABLE_NAME = aws_dynamodb_table.products.name
    }
  }
}`,
      },
    ],
    costs: {
      total: 312.4,
      breakdown: [
        { service: 'API Gateway (Regional, 2 regions)', cost: 28.0, is_calculated: true },
        { service: 'Lambda (10M req/mo)', cost: 18.0, is_calculated: true },
        { service: 'DynamoDB Global Tables', cost: 124.0, is_calculated: true },
        { service: 'ElastiCache r7g.large', cost: 98.4, is_calculated: true },
        { service: 'CloudFront (100GB)', cost: 12.0, is_calculated: true },
        { service: 'Route 53 + WAF', cost: 32.0, is_calculated: true },
      ],
    },
  },
]

export const ChatBox: React.FC = () => {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

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

  return (
    <div className="flex flex-col h-full bg-gray-50">
      {/* Messages / Welcome */}
      <div className={`flex-1 overflow-y-auto ${messages.length > 0 ? 'px-4 py-6 space-y-6' : 'flex'}`}>
        {messages.length === 0 ? (
          /* Welcome screen */
          <div className="flex flex-col items-center justify-center flex-1 gap-6 px-4">
            {/* Logo area */}
            <div className="flex flex-col items-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-aws-orange flex items-center justify-center">
                <svg className="w-8 h-8 text-aws-squid" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              </div>
              <h1 className="text-2xl font-bold text-aws-squid">AWS Architecture Advisor</h1>
              <p className="text-sm text-gray-500 text-center max-w-xs leading-relaxed">
                Describe your AWS workload to get a production-ready architecture plan.
              </p>
            </div>
            {/* Prompt chips */}
            <div className="flex flex-wrap gap-2 justify-center max-w-lg">
              {[
                'Serverless e-commerce API',
                'Multi-region DR setup',
                'ML inference pipeline',
                'Event-driven microservices',
              ].map((chip) => (
                <button
                  key={chip}
                  onClick={() => setInput(chip)}
                  className="px-4 py-2 rounded-full border border-gray-300 text-sm text-gray-700 hover:border-aws-orange hover:text-aws-squid hover:bg-aws-orange/10 transition-colors cursor-pointer"
                >
                  {chip}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Message list */
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {/* Avatar — assistant */}
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-aws-orange flex items-center justify-center shrink-0 mt-1 shadow-sm">
                    <svg className="w-4 h-4 text-aws-squid" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                  </div>
                )}

                <div className={`max-w-3xl ${msg.role === 'user' ? 'order-first' : ''}`}>
                  {/* Bubble */}
                  <div
                    className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-aws-squid text-white rounded-tr-sm ml-auto'
                        : 'bg-white border border-gray-200 text-gray-800 rounded-tl-sm shadow-sm'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>

                  {/* Rich panels — only on assistant messages */}
                  {msg.role === 'assistant' && (
                    <>
                      {/* DIAGRAM — MermaidViewer owns its panel; no outer wrapper */}
                      {msg.diagram && (
                        <MermaidViewer definition={msg.diagram} />
                      )}

                      {/* COST — CostTable owns its panel; no outer wrapper */}
                      {msg.costs && msg.costs.breakdown.length > 0 && (
                        <CostTable total={msg.costs.total} breakdown={msg.costs.breakdown} />
                      )}

                      {/* IaC / TERRAFORM — ChatBox keeps this panel (has download button) */}
                      {msg.iac && msg.iac.length > 0 && (
                        <div className="mt-3 rounded-xl overflow-hidden border border-gray-200 shadow-sm">
                          {/* Updated header: aws-squid to match other panels */}
                          <div className="flex items-center justify-between px-4 py-2 bg-aws-squid border-b border-aws-squid-light">
                            <div className="flex items-center gap-2">
                              <svg className="w-4 h-4 text-aws-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                              </svg>
                              <span className="text-xs font-bold text-gray-300 uppercase tracking-widest">TERRAFORM</span>
                            </div>
                            {/* Download button — Phase 5 will wire real generation */}
                            <button
                              onClick={() => showToast('⬇️ Terraform download coming in Phase 5')}
                              className="flex items-center gap-1.5 text-xs px-3 py-1 rounded-md bg-aws-orange text-aws-squid font-semibold hover:bg-aws-orange-dark transition-colors"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                              </svg>
                              Download .tf
                            </button>
                          </div>
                          <div className="p-4 space-y-3">
                            {msg.iac.map((snippet, j) => (
                              <CodeSnippet
                                key={j}
                                code={snippet.content}
                                language={snippet.type === 'terraform' ? 'hcl' : 'yaml'}
                              />
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Avatar — user */}
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center shrink-0 mt-1 text-gray-600 font-bold text-sm">
                    U
                  </div>
                )}
              </div>
            ))}

            {/* Loading indicator */}
            {loading && (
              <div className="flex gap-3 justify-start">
                <div className="w-8 h-8 rounded-full bg-aws-orange flex items-center justify-center shrink-0 shadow-sm">
                  <svg className="w-4 h-4 text-aws-squid" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                  <div className="flex gap-1 items-center h-5">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:0ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:150ms]" />
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce [animation-delay:300ms]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Inline error banner */}
      {error && (
        <div className="mx-4 mb-3 flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5C2.962 18.333 3.924 20 5.464 20z" />
          </svg>
          <span className="flex-1">Something went wrong — please try again.</span>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            ×
          </button>
        </div>
      )}
      <div className="shrink-0 bg-white border-t border-gray-200 px-4 py-3">
        <div className="max-w-3xl mx-auto flex gap-2 items-end">
          <textarea
            className="flex-1 resize-none p-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-aws-orange/40 focus:border-aws-orange focus:outline-none max-h-40 min-h-[44px]"
            placeholder="Describe your AWS workload…"
            rows={1}
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
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="h-11 w-11 rounded-xl bg-aws-orange hover:bg-aws-orange-dark disabled:bg-gray-200 disabled:cursor-not-allowed transition-colors flex items-center justify-center shrink-0"
          >
            <svg className="w-5 h-5 text-aws-squid disabled:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>
        <p className="text-center text-xs text-gray-400 mt-2">Shift+Enter for new line · Enter to send</p>
      </div>

      {/* Toast notification */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 bg-aws-squid text-white text-sm px-4 py-2 rounded-full shadow-lg z-50 animate-bounce-once">
          {toast}
        </div>
      )}
    </div>
  )
}

