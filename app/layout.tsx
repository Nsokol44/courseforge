import type { Metadata } from 'next'
import Script from 'next/script'
import './globals.css'
import { Toaster } from 'react-hot-toast'

export const metadata: Metadata = {
  title: 'CourseForge AI — Intelligent Course Design',
  description: 'AI-powered course design platform for professors.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* JSZip loaded globally for .imscc parsing — no npm install needed */}
        <Script
          src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"
          strategy="beforeInteractive"
        />
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: '#0b0c0f',
              color: '#f5f2ec',
              fontFamily: "'Geist', sans-serif",
              fontSize: '13px',
              borderLeft: '3px solid #b8860b',
              borderRadius: '8px',
            },
            success: { iconTheme: { primary: '#3a5c3a', secondary: '#fff' } },
            error:   { iconTheme: { primary: '#8b3a2a', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}
