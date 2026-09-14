import { ArrowLeft, Combine, FileImage, FileText, Hash, ImagePlus, LayoutGrid, MessageSquareText, PenTool, Printer, X } from "lucide-react";
import { createPdfFromImages, exportPagesAsImages, printTab, showDocumentProperties } from "../app/actions";
import { useActiveTab, useApp, type ToolPanel as ToolPanelId } from "../store";
import { CommentPanel } from "./CommentPanel";
import { OrganizePanel } from "./OrganizePanel";
import { FillSignPanel } from "./FillSignPanel";
import { CombinePanel } from "./CombinePanel";
import { ConvertPanel } from "./ConvertPanel";

export function ToolPanelHeader({ title }: { title: string }) {
  const setToolPanel = useApp((s) => s.setToolPanel);
  const setTool = useApp((s) => s.setTool);
  const back = () => {
    setTool("select");
    setToolPanel("tools");
  };
  return (
    <div className="panel__title">
      <button className="iconBtn iconBtn--sm" onClick={back} aria-label="Back to all tools" title="All tools">
        <ArrowLeft size={14} />
      </button>
      <span>{title}</span>
      <button className="iconBtn iconBtn--sm" onClick={() => setToolPanel(null)} aria-label="Close panel" title="Close">
        <X size={14} />
      </button>
    </div>
  );
}

interface ToolEntry {
  id: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  needsDoc: boolean;
  run: (tabId: string | null) => void;
}

/** Acrobat-style "All tools" list; each entry opens a tool panel or runs an action. */
export function AllToolsPanel() {
  const setToolPanel = useApp((s) => s.setToolPanel);
  const tab = useActiveTab();
  const docReady = !!tab?.pdf;
  const open = (id: ToolPanelId) => () => setToolPanel(id);
  const entries: ToolEntry[] = [
    { id: "comment", label: "Comment", icon: <MessageSquareText size={18} />, color: "#f0781e", needsDoc: true, run: open("comment") },
    { id: "fillsign", label: "Fill & Sign", icon: <PenTool size={18} />, color: "#d93a8c", needsDoc: true, run: open("fillsign") },
    { id: "organize", label: "Organize pages", icon: <LayoutGrid size={18} />, color: "#3aa757", needsDoc: true, run: open("organize") },
    { id: "combine", label: "Combine files", icon: <Combine size={18} />, color: "#6a4ee8", needsDoc: false, run: open("combine") },
    { id: "convert", label: "Export & convert", icon: <FileImage size={18} />, color: "#1473e6", needsDoc: false, run: open("convert") },
    { id: "images", label: "Create PDF from images", icon: <ImagePlus size={18} />, color: "#e5343a", needsDoc: false, run: () => createPdfFromImages() },
    { id: "export", label: "Export pages as images", icon: <FileImage size={18} />, color: "#2e7ee6", needsDoc: true, run: (id) => id && exportPagesAsImages(id, "png", 150) },
    { id: "numbers", label: "Page numbers & watermark", icon: <Hash size={18} />, color: "#0d9e8f", needsDoc: true, run: open("convert") },
    { id: "print", label: "Print", icon: <Printer size={18} />, color: "#5c5c5c", needsDoc: true, run: (id) => id && printTab(id) },
    { id: "props", label: "Document properties", icon: <FileText size={18} />, color: "#8a5cf5", needsDoc: true, run: (id) => id && showDocumentProperties(id) },
  ];
  return (
    <div className="panel">
      <div className="panel__title">
        <span>All tools</span>
        <button className="iconBtn iconBtn--sm" onClick={() => setToolPanel(null)} aria-label="Close panel" title="Close">
          <X size={14} />
        </button>
      </div>
      <div className="panel__body panel__body--list">
        {entries.map((e) => (
          <button key={e.id} className="toolRow" disabled={e.needsDoc && !docReady} onClick={() => e.run(tab?.id ?? null)}>
            <span className="toolRow__icon" style={{ color: e.color }}>
              {e.icon}
            </span>
            <span className="toolRow__label">{e.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function ToolPanelHost() {
  const which = useApp((s) => s.toolPanel);
  const tab = useActiveTab();
  if (!which) return null;
  const docReady = !!tab?.pdf;
  let body: React.ReactNode;
  switch (which) {
    case "comment":
      body = docReady ? <CommentPanel /> : <AllToolsPanel />;
      break;
    case "organize":
      body = docReady && tab ? <OrganizePanel tab={tab} /> : <AllToolsPanel />;
      break;
    case "fillsign":
      body = docReady ? <FillSignPanel /> : <AllToolsPanel />;
      break;
    case "combine":
      body = <CombinePanel />;
      break;
    case "convert":
      body = <ConvertPanel />;
      break;
    default:
      body = <AllToolsPanel />;
  }
  return <aside className={"toolPanel" + (which === "tools" ? " toolPanel--list" : "")}>{body}</aside>;
}
