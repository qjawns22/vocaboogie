import type { Metadata } from "next";
export const metadata: Metadata = { title: "보카북이 — 사진·엑셀 단어 학습", description: "기기 어디서나 함께 쓰는 나의 영어 단어장", icons: { icon: "/legacy/favicon.svg" } };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="ko"><head><link rel="stylesheet" href="/legacy/styles.css?v=9" /></head><body>{children}</body></html>; }
