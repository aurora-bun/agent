import { useEffect } from "react";
import { FolderOpen } from "lucide-react";
import { openFileDialog } from "../app/actions";
import { applyTool } from "../app/viewers";
import { pushEditorDefaults } from "../panels/CommentPanel";
import { OrganizeGrid } from "../panels/OrganizePanel";
import { useApp } from "../store";
import { ErrorBoundary } from "./ErrorBoundary";
import { Home } from "./Home";
import { QuickTools } from "./QuickTools";
import { Viewer } from "./Viewer";

export function DocumentArea() {
  const tabs = useApp((s) => s.tabs);
  const activeId = useApp((s) => s.activeId);
  const toolPanel = useApp((s) => s.toolPanel);
  const tool = useApp((s) => s.tool);
  const placing = useApp((s) => s.placing);
  const dropHover = useApp((s) => s.dropHover);
  const view = useApp((s) => s.view);

  // Keep the pdf.js editor mode (and our default colours) in sync with the tool.
  useEffect(() => {
    applyTool(activeId, tool);
    const timer = setTimeout(() => pushEditorDefaults(tool), 120);
    return () => clearTimeout(timer);
  }, [activeId, tool]);

  const active = tabs.find((t) => t.id === activeId);
  const showHome = view === "home" || tabs.length === 0;
  const organizing = !showHome && toolPanel === "organize" && !!active?.pdf;

  return (
    <div className={"docArea" + (placing ? " is-placing" : "") + (showHome ? " docArea--home" : "")}>
      {tabs.map((t) => (
        <ErrorBoundary key={t.id} label={t.name}>
          <Viewer tab={t} active={!showHome && t.id === activeId && !organizing} />
        </ErrorBoundary>
      ))}
      {showHome && tabs.length > 0 && <Home />}
      {showHome && tabs.length === 0 && (view === "home" ? <Home /> : (
        <div className="docArea__empty">
          <p>No document open.</p>
          <button className="btn btn--primary" onClick={openFileDialog}>
            <FolderOpen size={16} /> Open PDF…
          </button>
        </div>
      ))}
      {organizing && active && <OrganizeGrid tab={active} />}
      {!showHome && active?.pdf && !organizing && <QuickTools />}
      {dropHover && (
        <div className="dropOverlay">
          <span>Drop to open</span>
        </div>
      )}
    </div>
  );
}
