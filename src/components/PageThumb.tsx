import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { cachedThumb, renderThumb } from "../lib/thumbs";

interface Props {
  pdf: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  docKey: string;
  /** Visual aspect ratio (height / width) used as a placeholder before render. */
  aspect?: number;
  className?: string;
}

/** Lazily rendered page image; renders only once scrolled into view. */
export function PageThumb({ pdf, pageNumber, width, docKey, aspect = 1.294, className }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | undefined>(() => cachedThumb(docKey, pageNumber, width));
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setVisible(true);
      },
      { rootMargin: "300px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    setUrl(cachedThumb(docKey, pageNumber, width));
  }, [docKey, pageNumber, width]);

  useEffect(() => {
    if (!visible || url) return;
    let cancelled = false;
    renderThumb(pdf, pageNumber, width, docKey)
      .then((u) => {
        if (!cancelled) setUrl(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [visible, url, pdf, pageNumber, width, docKey]);

  return (
    <div ref={ref} className={"pageThumb" + (className ? " " + className : "")} style={{ width, minHeight: url ? undefined : width * aspect }}>
      {url ? <img src={url} alt={`Page ${pageNumber}`} draggable={false} /> : <div className="pageThumb__placeholder" />}
    </div>
  );
}
