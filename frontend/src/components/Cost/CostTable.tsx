import React from 'react'

interface BreakdownItem {
  service: string
  cost: number
  is_calculated: boolean
}

interface CostTableProps {
  total: number
  breakdown: BreakdownItem[]
}

export const CostTable: React.FC<CostTableProps> = ({ total, breakdown }) => {
  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden my-4">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Monthly Cost</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {breakdown.map((item, i) => (
            <tr key={i}>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                {item.service}
                {!item.is_calculated && <span className="ml-2 text-xs text-orange-500 italic">(Not Calculated)</span>}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                ${item.cost.toFixed(2)}
              </td>
            </tr>
          ))}
          <tr className="bg-gray-50 font-bold">
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Total Estimate</td>
            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">${total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
