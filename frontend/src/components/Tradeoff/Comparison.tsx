import React from 'react'

interface TradeOffViewProps {
  analysis: string
}

export const TradeOffView: React.FC<TradeOffViewProps> = ({ analysis }) => {
  return (
    <div className="bg-white p-4 rounded-lg border border-blue-100 shadow-sm my-4">
      <h4 className="text-blue-800 font-bold mb-2 flex items-center">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        Trade-off Analysis
      </h4>
      <div className="prose prose-blue prose-sm max-w-none">
        <p className="whitespace-pre-wrap text-gray-700">{analysis}</p>
      </div>
    </div>
  )
}
