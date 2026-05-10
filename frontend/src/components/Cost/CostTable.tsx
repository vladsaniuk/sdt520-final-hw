import React from 'react'
import {
  Box,
  Table,
  Thead,
  Tbody,
  Tfoot,
  Tr,
  Th,
  Td,
  Badge,
  Text,
} from '@chakra-ui/react'

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
    <Box borderRadius="xl" overflow="hidden" border="1px solid" borderColor="gray.200" boxShadow="sm" my={2}>
      <Table size="sm" variant="simple">
        <Thead bg="aws.squid">
          <Tr>
            <Th color="white" textTransform="uppercase" letterSpacing="wider" fontSize="xs">Service</Th>
            <Th color="white" textTransform="uppercase" letterSpacing="wider" fontSize="xs" isNumeric>Monthly Cost</Th>
          </Tr>
        </Thead>
        <Tbody>
          {breakdown.map((item, i) => (
            <Tr key={i} bg={i % 2 === 0 ? 'white' : 'gray.50'}>
              <Td fontSize="sm" color="gray.800">
                {item.service}
                {!item.is_calculated && (
                  <Badge ml={2} colorScheme="gray" variant="subtle" fontSize="10px">est.</Badge>
                )}
              </Td>
              <Td fontSize="sm" color="gray.800" isNumeric>${item.cost.toFixed(2)}</Td>
            </Tr>
          ))}
        </Tbody>
        <Tfoot>
          <Tr bg="aws.squidDark">
            <Td fontWeight="bold" color="white" fontSize="sm">Total Estimate</Td>
            <Td fontWeight="bold" color="aws.orange" fontSize="sm" isNumeric>${total.toFixed(2)}</Td>
          </Tr>
        </Tfoot>
      </Table>
    </Box>
  )
}
