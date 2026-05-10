import React from 'react'
import { HStack, Button, Spinner } from '@chakra-ui/react'

export type GenerateType = 'architecture' | 'costs' | 'terraform'

export interface ActionBarProps {
  /** Which buttons have been unlocked (signal received from backend) */
  unlockedButtons: GenerateType[]
  /** Which buttons are stale (need re-generation after new message) */
  staleButtons: GenerateType[]
  /** Which button is currently loading (spinner shown) */
  loadingButton: GenerateType | null
  onGenerate: (type: GenerateType) => void
}

const BUTTON_DEFS: Array<{ type: GenerateType; label: string; unlockColor: string; staleColor: string; staleTextColor: string; staleTextColorCss: string; staleBorderColorCss: string }> = [
  {
    type: 'architecture',
    label: '⚡ Generate Architecture',
    unlockColor: '#FF9900',
    staleColor: '#7B3F00',
    staleTextColor: 'orange.200',
    staleTextColorCss: '#FED7AA',
    staleBorderColorCss: '#F97316',
  },
  {
    type: 'costs',
    label: '💰 Generate Costs',
    unlockColor: '#48BB78',
    staleColor: '#1C4532',
    staleTextColor: 'green.200',
    staleTextColorCss: '#9AE6B4',
    staleBorderColorCss: '#48BB78',
  },
  {
    type: 'terraform',
    label: '🏗 Generate Terraform',
    unlockColor: '#63B3ED',
    staleColor: '#1A365D',
    staleTextColor: 'blue.200',
    staleTextColorCss: '#BEE3F8',
    staleBorderColorCss: '#63B3ED',
  },
]

export const ActionBar: React.FC<ActionBarProps> = ({
  unlockedButtons,
  staleButtons,
  loadingButton,
  onGenerate,
}) => {
  return (
    <>
      <style>{`
        @keyframes actionbar-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 rgba(255,153,0,0); }
          50% { opacity: 0.82; box-shadow: 0 0 0 3px rgba(255,153,0,0.3); }
        }
        .actionbar-stale {
          animation: actionbar-pulse 2s ease-in-out infinite;
        }
      `}</style>

      <HStack
        px={4}
        py={2}
        bg="aws.squid"
        borderBottom="1px solid"
        borderColor="aws.squidLight"
        spacing={2}
        flexShrink={0}
        flexWrap="wrap"
      >
        {BUTTON_DEFS.map(({ type, label, unlockColor, staleColor, staleTextColorCss, staleBorderColorCss }) => {
          const isUnlocked = unlockedButtons.includes(type)
          const isStale = staleButtons.includes(type)
          const isLoading = loadingButton === type
          const isDisabled = !isUnlocked || isLoading

          const buttonStyle: React.CSSProperties = isDisabled && !isLoading
            ? { opacity: 0.4, cursor: 'not-allowed' }
            : isStale
            ? {
                backgroundColor: staleColor,
                color: staleTextColorCss,
                border: `1px solid ${staleBorderColorCss}`,
              }
            : isUnlocked
            ? {
                backgroundColor: unlockColor,
                color: type === 'architecture' ? '#232F3E' : 'white',
              }
            : { opacity: 0.4 }

          return (
            <button
              key={type}
              disabled={isDisabled}
              className={isStale && !isDisabled ? 'actionbar-stale' : undefined}
              onClick={() => !isDisabled && onGenerate(type)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '5px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                border: '1px solid transparent',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
                background: 'rgba(255,255,255,0.08)',
                color: '#718096',
                ...buttonStyle,
              }}
            >
              {isLoading && <Spinner size="xs" />}
              {label}
            </button>
          )
        })}
      </HStack>
    </>
  )
}
