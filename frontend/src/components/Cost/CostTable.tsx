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
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm my-2">
      <table className="min-w-full">
        <thead className="bg-aws-squid">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-bold text-white uppercase tracking-wider">
              Service
            </th>
            <th className="px-4 py-3 text-right text-xs font-bold text-white uppercase tracking-wider">
              Monthly Cost
            </th>
          </tr>
        </thead>
        <tbody>
          {breakdown.map((item, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-4 py-3 text-sm text-gray-800">
                {item.service}
                {!item.is_calculated && (
                  <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-2 py-1 rounded font-normal">
                    (est.)
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-800 text-right">
                ${item.cost.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-aws-squid-dark">
            <td className="px-4 py-3 text-sm font-bold text-white">
              Total Estimate
            </td>
            <td className="px-4 py-3 text-sm font-bold text-aws-orange text-right">
              ${total.toFixed(2)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
