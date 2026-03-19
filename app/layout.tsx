import type { Metadata } from 'next'
import { Bebas_Neue, Inter } from 'next/font/google'
import './globals.css'
import Nav from '@/components/Nav'
import { createClient } from '@/lib/supabase/server'
import { Analytics } from '@vercel/analytics/next'

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

async function getContestYear(): Promise<string> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('settings').select('value').eq('key', 'contest_year').single()
    if (data?.value != null) return String(data.value)
  } catch {}
  return new Date().getFullYear().toString()
}

export async function generateMetadata(): Promise<Metadata> {
  const year = await getContestYear()
  return {
    title: `Sexton March Madness ${year}`,
    description: 'The Sexton Family March Madness bracket contest. Pick 8 teams, earn points, win prizes.',
    openGraph: {
      title: `Sexton March Madness ${year}`,
      description: 'March Madness pool contest — pick 8 teams, earn points for wins and upsets.',
    },
  }
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebasNeue.variable} ${inter.variable}`}>
      <body className="antialiased min-h-screen bg-[#0a0e17] text-white font-sans">
        <Nav />
        <main>{children}</main>
        <Analytics />
      </body>
    </html>
  )
}
