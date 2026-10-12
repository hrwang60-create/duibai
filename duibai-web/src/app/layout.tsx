import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '「对白」把文章，聊给你听',
  description: '把一篇文章改写成双人口语对谈 —— 依据实验3 设计基线的 Web 实现'
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  )
}
