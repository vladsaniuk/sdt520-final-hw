import { extendTheme, type ThemeConfig } from '@chakra-ui/react'

const config: ThemeConfig = {
  initialColorMode: 'light',
  useSystemColorMode: false,
}

const theme = extendTheme({
  config,
  colors: {
    aws: {
      orange: '#FF9900',
      orangeDark: '#E8891A',
      squid: '#232F3E',
      squidLight: '#37475A',
      squidDark: '#1A232E',
    },
  },
  fonts: {
    heading: `'Geist', system-ui, sans-serif`,
    body: `'Geist', system-ui, sans-serif`,
    mono: `'Geist Mono', 'Fira Code', monospace`,
  },
  styles: {
    global: {
      'html, body': {
        height: '100%',
        margin: 0,
        padding: 0,
      },
      '#root': {
        height: '100%',
      },
    },
  },
  components: {
    Button: {
      variants: {
        aws: {
          bg: 'aws.orange',
          color: 'aws.squid',
          fontWeight: 'bold',
          _hover: { bg: 'aws.orangeDark' },
          _disabled: { bg: 'gray.200', color: 'gray.400', cursor: 'not-allowed' },
        },
      },
    },
  },
})

export default theme
