import { useEffect, useState } from "react";
import { Bookmark, ChevronDown, ChevronUp, LayoutList, Maximize, RotateCw, Search, ZoomIn, ZoomOut } from "lucide-react";
import { goToPage, nextPage, previousPage, rotateView, setScaleValue, zoomIn, zoomOut } from "../app/viewers";
import { shortcut } from "../lib/platform";
import { useActiveTab, useApp, type NavPanel } from "../store";

/** Right-hand rail: navigation panel toggles on top, page/zoom controls below. */
export function RightRail() {
  const tab = useActiveTab();
  const navPanel = useApp((s) => s.navPanel);
  const setNavPanel = useApp((s) => s.setNavPanel);
  const toolPanel = useApp((s) => s.toolPanel);
  const [pageInput, setPageInput] = useState("1");
  const ready = !!tab?.pdf;
  const organizing = toolPanel === "organize" && ready;
  const navDisabled = !ready || organizing;

  useEffect(() => {
    setPageInput(String(tab?.currentPage ?? 1));
  }, [tab?.currentPage, tab?.id]);

  const commitPage = () => {
    const n = parseInt(pageInput, 10);
    if (Number.isFinite(n)) goToPage(n);
    else setPageInput(String(tab?.currentPage ?? 1));
  };

  const panels: Array<{ id: NavPanel; icon: React.ReactNode; label: string }> = [
    { id: "thumbs", icon: <LayoutList size={18} />, label: "Page thumbnails" },
    { id: "outline", icon: <Bookmark size={18} />, label: "Bookmarks" },
    { id: "search", icon: <Search size={18} />, label: `Find (${shortcut("Ctrl+F")})` },
  ];

  return (
    <aside className="rail" aria-label="Navigation">
      <div className="rail__group">
        {panels.map((p) => (
          <button
            key={p.id}
            className={"rail__btn" + (navPanel === p.id ? " is-active" : "")}
            onClick={() => setNavPanel(navPanel === p.id ? null : p.id)}
            disabled={!ready}
            title={p.label}
            aria-label={p.label}
          >
            {p.icon}
          </button>
        ))}
      </div>
      <div className="rail__spacer" />
      <div className="rail__group rail__nav">
        <input
          className="rail__page"
          value={pageInput}
          disabled={navDisabled}
          onChange={(e) => setPageInput(e.target.value.replace(/[^\d]/g, ""))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commitPage();
              (e.target as HTMLInputElement).blur();
            }
          }}
          onBlur={commitPage}
          onFocus={(e) => e.target.select()}
          aria-label="Page number"
        />
        <span className="rail__total" title="Page count">
          {tab?.pageCount ?? "–"}
        </span>
        <button className="rail__btn" onClick={previousPage} disabled={navDisabled} title="Previous page" aria-label="Previous page">
          <ChevronUp size={17} />
        </button>
        <button className="rail__btn" onClick={nextPage} disabled={navDisabled} title="Next page" aria-label="Next page">
          <ChevronDown size={17} />
        </button>
        <button className="rail__btn" onClick={() => rotateView(90)} disabled={navDisabled} title="Rotate view" aria-label="Rotate view">
          <RotateCw size={16} />
        </button>
        <button className="rail__btn" onClick={() => setScaleValue("page-fit")} disabled={navDisabled} title={`Fit page (${shortcut("Ctrl+0")})`} aria-label="Fit page">
          <Maximize size={16} />
        </button>
        <button className="rail__btn" onClick={zoomIn} disabled={navDisabled} title={`Zoom in (${shortcut("Ctrl++")})`} aria-label="Zoom in">
          <ZoomIn size={17} />
        </button>
        <button className="rail__btn" onClick={zoomOut} disabled={navDisabled} title={`Zoom out (${shortcut("Ctrl+-")})`} aria-label="Zoom out">
          <ZoomOut size={17} />
        </button>
        <span className="rail__zoom" title="Zoom level">
          {tab ? `${Math.round(tab.scale * 100)}%` : ""}
        </span>
      </div>
    </aside>
  );
}
