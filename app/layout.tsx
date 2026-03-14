import type { Metadata } from 'next'
import { Bebas_Neue, Inter } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'

const bebasNeue = Bebas_Neue({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-bebas',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Sexton March Madness 2025',
  description: 'The Sexton Family March Madness bracket contest. Pick 8 teams, earn points, win prizes.',
  openGraph: {
    title: 'Sexton March Madness 2025',
    description: 'March Madness pool contest — pick 8 teams, earn points for wins and upsets.',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable}`}>
      <body className="antialiased min-h-screen bg-[#0a0e17] text-white font-sans">
        <Nav />
        <main>{children}</main>
      </body>
    </html>
  )
}
