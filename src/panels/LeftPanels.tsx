import { useEffect, useRef, useState } from "react";
import type { PDFDocumentProxy } from "pdfjs-dist";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { PageThumb } from "../components/PageThumb";
import { clearFind, find, getViewer, goToPage } from "../app/viewers";
import { useApp, type DocTab } from "../store";

/* ---------- thumbnails ---------- */

export function ThumbnailsPanel({ tab }: { tab: DocTab }) {
  const listRef = useRef<HTMLDivElement>(null);
  const pdf = tab.pdf;
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-page="${tab.currentPage}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [tab.currentPage]);
  if (!pdf) return null;
  const docKey = `${tab.id}:${tab.version}`;
  const pages = Array.from({ length: tab.pageCount }, (_, i) => i + 1);
  return (
    <div className="panel">
      <PanelHeader title="Pages" />
      <div className="thumbList" ref={listRef}>
        {pages.map((n) => (
          <button
            key={n}
            data-page={n}
            className={"thumbItem" + (n === tab.currentPage ? " is-current" : "")}
            onClick={() => goToPage(n)}
            title={`Page ${n}`}
          >
            <PageThumb pdf={pdf} pageNumber={n} width={132} docKey={docKey} />
            <span className="thumbItem__label">{n}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ---------- outline ---------- */

type OutlineItem = NonNullable<Awaited<ReturnType<PDFDocumentProxy["getOutline"]>>>[number];

function OutlineNode({ item, depth, tabId }: { item: OutlineItem; depth: number; tabId: string }) {
  const [open, setOpen] = useState(depth < 1);
  const hasKids = item.items && item.items.length > 0;
  const go = () => {
    const h = getViewer(tabId);
    if (!h) return;
    if (item.dest) h.linkService.goToDestination(item.dest).catch(() => {});
  };
  return (
    <div className="outlineNode">
      <div className="outlineRow" style={{ paddingLeft: 8 + depth * 14 }}>
        {hasKids ? (
          <button className="outlineRow__toggle" onClick={() => setOpen(!open)} aria-label={open ? "Collapse" : "Expand"}>
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="outlineRow__toggle" />
        )}
        <button className={"outlineRow__label" + (item.bold ? " is-bold" : "") + (item.italic ? " is-italic" : "")} onClick={go} title={item.title}>
          {item.title || "(untitled)"}
        </button>
      </div>
      {hasKids && open && item.items.map((child, i) => <OutlineNode key={i} item={child} depth={depth + 1} tabId={tabId} />)}
    </div>
  );
}

export function OutlinePanel({ tab }: { tab: DocTab }) {
  const [items, setItems] = useState<OutlineItem[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    tab.pdf
      ?.getOutline()
      .then((o) => {
        if (!cancelled) setItems(o ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [tab.pdf]);
  return (
    <div className="panel">
      <PanelHeader title="Bookmarks" />
      <div className="panel__body">
        {items === null && <div className="panel__hint">Loading…</div>}
        {items && items.length === 0 && <div className="panel__hint">This document has no bookmarks.</div>}
        {items && items.map((it, i) => <OutlineNode key={i} item={it} depth={0} tabId={tab.id} />)}
      </div>
    </div>
  );
}

/* ---------- search ---------- */

const FIND_NOT_FOUND = 1;
const FIND_PENDING = 3;

export function SearchPanel({ tab }: { tab: DocTab }) {
  const [query, setQuery] = useState(() => {
    const pending = useApp.getState().pendingFind;
    if (pending !== null) useApp.getState().setPendingFind(null);
    return pending ?? "";
  });
  const pendingFind = useApp((s) => s.pendingFind);
  useEffect(() => {
    if (pendingFind !== null) {
      setQuery(pendingFind);
      useApp.getState().setPendingFind(null);
    }
  }, [pendingFind]);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [entireWord, setEntireWord] = useState(false);
  const [count, setCount] = useState<{ current: number; total: number } | null>(null);
  const [state, setState] = useState<number | null>(null);
  const [pageHits, setPageHits] = useState<number[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [tab.id]);

  useEffect(() => {
    const h = getViewer(tab.id);
    if (!h) return;
    const readHits = () => {
      const matches = (h.findController.pageMatches ?? []) as Array<number[] | undefined>;
      setPageHits(matches.map((m) => m?.length ?? 0));
    };
    const onCount = (e: { matchesCount: { current: number; total: number } }) => {
      setCount(e.matchesCount);
      readHits();
    };
    const onState = (e: { state: number; matchesCount: { current: number; total: number } }) => {
      setState(e.state);
      setCount(e.matchesCount);
      readHits();
    };
    h.eventBus.on("updatefindmatchescount", onCount);
    h.eventBus.on("updatefindcontrolstate", onState);
    return () => {
      h.eventBus.off("updatefindmatchescount", onCount);
      h.eventBus.off("updatefindcontrolstate", onState);
    };
  }, [tab.id, tab.pdf]);

  const opts = { caseSensitive, entireWord, highlightAll: true };
  useEffect(() => {
    if (query.trim()) find(query, opts);
    else {
      clearFind();
      setCount(null);
      setState(null);
      setPageHits([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, caseSensitive, entireWord, tab.pdf]);

  useEffect(() => () => clearFind(), []);

  const status = (() => {
    if (!query.trim()) return "";
    if (state === FIND_PENDING && !count?.total) return "Searching…";
    if (state === FIND_NOT_FOUND || (count && count.total === 0 && state !== FIND_PENDING)) return "No matches";
    if (count) return `${count.current || 0} of ${count.total} match${count.total === 1 ? "" : "es"}`;
    return "";
  })();

  return (
    <div className="panel">
      <PanelHeader title="Find" />
      <div className="searchBox">
        <input
          ref={inputRef}
          className="input"
          placeholder="Find in document…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") find(query, opts, "again", e.shiftKey);
            if (e.key === "Escape") setQuery("");
          }}
        />
        <div className="searchBox__row">
          <button className="btn btn--sm" onClick={() => find(query, opts, "again", true)} disabled={!query.trim()}>
            Previous
          </button>
          <button className="btn btn--sm" onClick={() => find(query, opts, "again", false)} disabled={!query.trim()}>
            Next
          </button>
          <span className="searchBox__status">{status}</span>
        </div>
        <label className="check">
          <input type="checkbox" checked={caseSensitive} onChange={(e) => setCaseSensitive(e.target.checked)} /> Match case
        </label>
        <label className="check">
          <input type="checkbox" checked={entireWord} onChange={(e) => setEntireWord(e.target.checked)} /> Whole words
        </label>
      </div>
      <div className="panel__body">
        {pageHits.some((n) => n > 0) && (
          <ul className="hitList">
            {pageHits.map((n, i) =>
              n > 0 ? (
                <li key={i}>
                  <button className="hitList__item" onClick={() => goToPage(i + 1)}>
                    <span>Page {i + 1}</span>
                    <span className="hitList__count">{n}</span>
                  </button>
                </li>
              ) : null,
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ---------- shared ---------- */

export function PanelHeader({ title }: { title: string }) {
  const setNavPanel = useApp((s) => s.setNavPanel);
  return (
    <div className="panel__title">
      <span>{title}</span>
      <button className="iconBtn iconBtn--sm" onClick={() => setNavPanel(null)} aria-label="Close panel" title="Close">
        <X size={14} />
      </button>
    </div>
  );
}
