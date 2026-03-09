/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ["class"],
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
  	container: {
  		center: true,
  		padding: '2rem',
  		screens: {
  			'2xl': '1400px'
  		}
  	},
  	extend: {
  		fontFamily: {
  			sans: [
  				'Lato',
  				'sans-serif'
  			],
  			lato: [
  				'Lato',
  				'sans-serif'
  			],
  			inter: [
  				'Inter',
  				'sans-serif'
  			]
  		},
  		colors: {
  			primary: {
  				'50': '#e8eef4',
  				'100': '#c5d5e3',
  				'200': '#9fb9d0',
  				'300': '#799dbd',
  				'400': '#5c87ae',
  				'500': '#3f72a0',
  				'600': '#0a2a4d',
  				'700': '#08244a',
  				'800': '#061f3f',
  				'900': '#041733',
  				DEFAULT: '#0A2A4D',
  				foreground: '#ffffff'
  			},
  			secondary: {
  				'50': '#e6f2fa',
  				'100': '#c0dff3',
  				'200': '#97caeb',
  				'300': '#6db5e3',
  				'400': '#4ea5dc',
  				'500': '#2f95d6',
  				'600': '#005A9C',
  				'700': '#004d85',
  				'800': '#00406e',
  				'900': '#002b4a',
  				DEFAULT: '#005A9C',
  				foreground: '#ffffff'
  			},
  			accent: {
  				'50': '#fff4e6',
  				'100': '#ffe4c0',
  				'200': '#ffd396',
  				'300': '#ffc16c',
  				'400': '#ffb04d',
  				'500': '#ff9f2e',
  				'600': '#FF7A00',
  				'700': '#e66d00',
  				'800': '#cc6100',
  				'900': '#b35500',
  				DEFAULT: '#FF7A00',
  				foreground: '#ffffff'
  			},
  			background: {
  				DEFAULT: '#F0F4F8',
  				dark: '#0a2a4d'
  			},
  			text: {
  				DEFAULT: '#334155',
  				light: '#64748b',
  				dark: '#1e293b'
  			},
  			hazard: {
  				typhoon: '#ff4d4f',
  				flood: '#1890ff',
  				earthquake: '#faad14',
  				landslide: '#8b4513',
  				drought: '#fa8c16'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			foreground: 'hsl(var(--foreground))',
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			},
  			'caret-blink': {
  				'0%,70%,100%': { opacity: '1' },
  				'20%,50%': { opacity: '0' }
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out',
  			'caret-blink': 'caret-blink 1.25s ease-out infinite'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
