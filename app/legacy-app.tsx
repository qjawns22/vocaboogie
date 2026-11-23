"use client";
import { useEffect } from "react";
import { vocabMarkup } from "./vocab-markup";
declare global { interface Window { __vocabookiStarted?: boolean; convertHeicToJpeg?: (file: File) => Promise<File> } }
export default function LegacyApp() {
  useEffect(() => {
    if (window.__vocabookiStarted) return;
    window.__vocabookiStarted = true;
    window.convertHeicToJpeg = async (file: File) => {
      const { heicTo } = await import("heic-to/csp");
      const jpeg = await heicTo({ blob: file, type: "image/jpeg", quality: 0.9 });
      return new File([jpeg], file.name.replace(/\.(heic|heif)$/i, "") + ".jpg", { type: "image/jpeg" });
    };
    (async () => {
      for (const src of ["/legacy/xlsx.full.min.js", "/legacy/curated-vocab.js", "/legacy/compose-feedback.js?v=2", "/legacy/compose-prompts.js?v=2", "/legacy/extra-examples.js?v=1", "/legacy/app.js?v=27"]) {
        await new Promise<void>((resolve, reject) => { const script = document.createElement("script"); script.src = src; script.onload = () => resolve(); script.onerror = () => reject(new Error(`스크립트를 불러올 수 없습니다: ${src}`)); document.body.appendChild(script); });
      }
    })().catch(console.error);
  }, []);
  return <div dangerouslySetInnerHTML={{ __html: vocabMarkup }} />;
}
