import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { Check, FileInput, FilePlus, ImagePlus, RotateCcw, RotateCw, Scissors, SquareDashed, Trash2 } from "lucide-react";
import { PageThumb } from "../components/PageThumb";
import { ENCRYPTED_MESSAGE, applyPageOp, extractPagesToFile, insertImagesIntoTab, insertPdfIntoTab, splitToFiles } from "../app/actions";
import { deletePages, insertBlankPage, reorderPages, rotatePages } from "../lib/pdfops";
import { confirmDialog } from "../lib/tauri";
import { useApp, type DocTab } from "../store";
import { ToolPanelHeader } from "./ToolPanel";

/* ---------- shared selection state ---------- */

interface OrganizeState {
  selected: number[]; // page indices (0-based)
  anchor: number | null;
  setSelected: (s: number[], anchor?: number | null) => void;
}

export const useOrganize = create<OrganizeState>((set) => ({
  selected: [],
  anchor: null,
  setSelected: (selected, anchor) => set((st) => ({ selected, anchor: anchor === undefined ? st.anchor : anchor })),
}));

/** Parse "1-3, 5, 8-10" into 0-based indices within [0, count). */
export function parsePageRange(text: string, count: number): number[] {
  const out = new Set<number>();
  for (const part of text.split(/[,\s]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) continue;
    const a = Number(m[1]);
    const b = m[2] ? Number(m[2]) : a;
    for (let i = Math.min(a, b); i <= Math.max(a, b); i++) if (i >= 1 && i <= count) out.add(i - 1);
  }
  return [...out].sort((x, y) => x - y);
}

/* ---------- page grid (replaces the viewer while organizing) ---------- */

const THUMB_W = 150;

export function OrganizeGrid({ tab }: { tab: DocTab }) {
  const { selected, anchor, setSelected } = useOrganize();
  const gridRef = useRef<HTMLDivElement>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pdf = tab.pdf;

  // Reset selection when the document changes underneath us.
  useEffect(() => {
    setSelected([], null);
  }, [tab.id, setSelected]);
  useEffect(() => {
    setSelected(
      selected.filter((i) => i < tab.pageCount),
      anchor !== null && anchor < tab.pageCount ? anchor : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.pageCount]);

  if (!pdf) return null;
  const docKey = `${tab.id}:${tab.version}`;
  const count = tab.pageCount;

  const select = (i: number, e: React.MouseEvent) => {
    if (e.shiftKey && anchor !== null) {
      const [a, b] = [Math.min(anchor, i), Math.max(anchor, i)];
      setSelected(Array.from({ length: b - a + 1 }, (_, k) => a + k));
    } else if (e.ctrlKey || e.metaKey) {
      setSelected(selected.includes(i) ? selected.filter((x) => x !== i) : [...selected, i].sort((x, y) => x - y), i);
    } else {
      setSelected([i], i);
    }
  };

  const computeDropIndex = (x: number, y: number): number => {
    const items = Array.from(gridRef.current?.querySelectorAll<HTMLElement>(".orgItem") ?? []);
    if (!items.length) return 0;
    let best = items.length;
    let bestRow: HTMLElement[] = [];
    // Find the row (items sharing a top) the pointer is in.
    const rows = new Map<number, HTMLElement[]>();
    for (const el of items) {
      const top = Math.round(el.getBoundingClientRect().top);
      rows.set(top, [...(rows.get(top) ?? []), el]);
    }
    const tops = [...rows.keys()].sort((a, b) => a - b);
    let rowTop = tops.find((t, i) => {
      const next = tops[i + 1];
      return y < (next ?? Infinity) && (i === 0 || y >= t);
    });
    if (rowTop === undefined) rowTop = tops[tops.length - 1];
    bestRow = rows.get(rowTop) ?? [];
    for (const el of bestRow) {
      const r = el.getBoundingClientRect();
      const idx = Number(el.dataset.index);
      if (x < r.left + r.width / 2) {
        best = idx;
        return best;
      }
      best = idx + 1;
    }
    return best;
  };

  const onPointerDown = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0 || tab.encrypted) return;
    const startX = e.clientX;
    const startY = e.clientY;
    let started = false;
    const moving = selected.includes(index) ? selected : [index];

    const onMove = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
        started = true;
        if (!selected.includes(index)) setSelected([index], index);
        setDragging(true);
      }
      const ghost = ghostRef.current;
      if (ghost) ghost.style.transform = `translate(${ev.clientX + 14}px, ${ev.clientY + 14}px)`;
      setDropIndex(computeDropIndex(ev.clientX, ev.clientY));
    };
    const onUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      if (!started) return;
      setDragging(false);
      const target = computeDropIndex(ev.clientX, ev.clientY);
      setDropIndex(null);
      const remaining = Array.from({ length: count }, (_, i) => i).filter((i) => !moving.includes(i));
      const insertAt = target - moving.filter((i) => i < target).length;
      const order = [...remaining.slice(0, insertAt), ...moving, ...remaining.slice(insertAt)];
      if (order.every((v, i) => v === i)) return;
      applyPageOp(tab.id, "Moving pages…", (b) => reorderPages(b, order), insertAt + 1).then((ok) => {
        if (ok) setSelected(moving.map((_, k) => insertAt + k), insertAt);
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <div className={"organize" + (dragging ? " is-dragging" : "")}>
      <div className="organize__bar">
        <span>
          {count} page{count === 1 ? "" : "s"}
          {selected.length > 0 && ` · ${selected.length} selected`}
        </span>
        <span className="organize__hint">Click to select · Ctrl/Shift for multiple · drag to reorder</span>
      </div>
      <div
        className="orgGrid"
        ref={gridRef}
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelected([], null);
        }}
      >
        {Array.from({ length: count }, (_, i) => (
          <div
            key={`${docKey}:${i}`}
            data-index={i}
            className={
              "orgItem" +
              (selected.includes(i) ? " is-selected" : "") +
              (dropIndex === i ? " is-dropBefore" : "") +
              (dropIndex === count && i === count - 1 ? " is-dropAfter" : "")
            }
            onClick={(e) => select(i, e)}
            onPointerDown={(e) => onPointerDown(e, i)}
          >
            <PageThumb pdf={pdf} pageNumber={i + 1} width={THUMB_W} docKey={docKey} />
            <span className="orgItem__num">{i + 1}</span>
            {selected.includes(i) && (
              <span className="orgItem__check">
                <Check size={12} />
              </span>
            )}
          </div>
        ))}
      </div>
      {dragging && (
        <div className="dragGhost" ref={ghostRef}>
          {selected.length} page{selected.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

/* ---------- right-hand actions ---------- */

export function OrganizePanel({ tab }: { tab: DocTab }) {
  const { selected, setSelected } = useOrganize();
  const setToolPanel = useApp((s) => s.setToolPanel);
  const [range, setRange] = useState("");
  const [every, setEvery] = useState(1);
  const count = tab.pageCount;
  const targets = selected.length ? selected : Array.from({ length: count }, (_, i) => i);
  const scope = selected.length ? `${selected.length} selected` : "all pages";
  const insertAt = selected.length ? Math.max(...selected) + 1 : count;

  const rotate = (delta: number) => applyPageOp(tab.id, "Rotating…", (b) => rotatePages(b, targets, delta));
  const remove = async () => {
    if (!selected.length) return;
    if (selected.length >= count) return useApp.getState().toast("A document must keep at least one page", "error");
    const ok = await confirmDialog(`Delete ${selected.length} page${selected.length === 1 ? "" : "s"}?`);
    if (!ok) return;
    const done = await applyPageOp(tab.id, "Deleting pages…", (b) => deletePages(b, selected), Math.min(...selected) + 1);
    if (done) setSelected([], null);
  };

  const locked = tab.encrypted;

  return (
    <div className="panel">
      <ToolPanelHeader title="Organize pages" />
      <div className="panel__body">
        {locked && <p className="notice">{ENCRYPTED_MESSAGE}</p>}
        <section className="section">
          <h4>Selection</h4>
          <div className="btnRow">
            <button className="btn btn--sm" onClick={() => setSelected(Array.from({ length: count }, (_, i) => i), 0)}>
              <SquareDashed size={14} /> Select all
            </button>
            <button className="btn btn--sm" onClick={() => setSelected([], null)} disabled={!selected.length}>
              Clear
            </button>
          </div>
          <label className="field">
            <span className="field__label">Select pages (e.g. 1-3, 7)</span>
            <input
              className="input"
              value={range}
              placeholder="1-3, 7"
              onChange={(e) => setRange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") setSelected(parsePageRange(range, count), null);
              }}
              onBlur={() => range.trim() && setSelected(parsePageRange(range, count), null)}
            />
          </label>
        </section>

        <section className="section">
          <h4>Pages ({scope})</h4>
          <div className="btnRow">
            <button className="btn btn--sm" onClick={() => rotate(-90)} title="Rotate anticlockwise" disabled={locked}>
              <RotateCcw size={14} /> Rotate left
            </button>
            <button className="btn btn--sm" onClick={() => rotate(90)} title="Rotate clockwise" disabled={locked}>
              <RotateCw size={14} /> Rotate right
            </button>
          </div>
          <div className="btnRow">
            <button className="btn btn--sm btn--danger" onClick={remove} disabled={!selected.length || locked}>
              <Trash2 size={14} /> Delete selected
            </button>
            <button className="btn btn--sm" onClick={() => extractPagesToFile(tab.id, selected)} disabled={!selected.length || locked} title="Save the selected pages as a new PDF">
              <FileInput size={14} /> Extract…
            </button>
          </div>
        </section>

        <section className="section">
          <h4>Insert {selected.length ? `after page ${insertAt}` : "at end"}</h4>
          <div className="btnRow">
            <button className="btn btn--sm" onClick={() => applyPageOp(tab.id, "Inserting page…", (b) => insertBlankPage(b, insertAt), insertAt + 1)} disabled={locked}>
              <FilePlus size={14} /> Blank page
            </button>
            <button className="btn btn--sm" onClick={() => insertPdfIntoTab(tab.id, insertAt)} disabled={locked}>
              <FileInput size={14} /> From PDF…
            </button>
            <button className="btn btn--sm" onClick={() => insertImagesIntoTab(tab.id, insertAt)} disabled={locked}>
              <ImagePlus size={14} /> Images…
            </button>
          </div>
        </section>

        <section className="section">
          <h4>
            <Scissors size={14} /> Split
          </h4>
          <div className="fieldRow">
            <label className="field">
              <span className="field__label">Pages per file</span>
              <input className="input" type="number" min={1} max={count} value={every} onChange={(e) => setEvery(Math.max(1, Number(e.target.value) || 1))} />
            </label>
            <button className="btn btn--sm" onClick={() => splitToFiles(tab.id, every)} disabled={count < 2 || locked}>
              Split into files…
            </button>
          </div>
        </section>

        <button className="btn btn--primary" onClick={() => setToolPanel("tools")}>
          Done
        </button>
      </div>
    </div>
  );
}
