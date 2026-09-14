import { Ellipsis, Highlighter, Image as ImageIcon, MousePointer2, PenLine, PenTool, StickyNote, Type } from "lucide-react";
import { useApp, type Tool } from "../store";

const TOOLS: Array<{ id: Tool; icon: React.ReactNode; label: string }> = [
  { id: "select", icon: <MousePointer2 size={17} />, label: "Select (Esc)" },
  { id: "highlight", icon: <Highlighter size={17} />, label: "Highlight text" },
  { id: "ink", icon: <PenLine size={17} />, label: "Draw" },
  { id: "text", icon: <Type size={17} />, label: "Add text box" },
  { id: "note", icon: <StickyNote size={17} />, label: "Add sticky note" },
  { id: "image", icon: <ImageIcon size={17} />, label: "Add image" },
];

/** Floating vertical tool strip over the document, like Acrobat's quick tools. */
export function QuickTools() {
  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);
  const toolPanel = useApp((s) => s.toolPanel);
  const setToolPanel = useApp((s) => s.setToolPanel);
  return (
    <div className="quickTools" role="toolbar" aria-label="Quick tools">
      {TOOLS.map((t) => (
        <button key={t.id} className={"quickTools__btn" + (tool === t.id ? " is-active" : "")} onClick={() => setTool(t.id)} title={t.label} aria-label={t.label}>
          {t.icon}
        </button>
      ))}
      <div className="quickTools__sep" />
      <button
        className={"quickTools__btn" + (toolPanel === "fillsign" ? " is-active" : "")}
        onClick={() => setToolPanel(toolPanel === "fillsign" ? null : "fillsign")}
        title="Fill & Sign"
        aria-label="Fill & Sign"
      >
        <PenTool size={17} />
      </button>
      <button className="quickTools__btn" onClick={() => setToolPanel(toolPanel === "comment" ? "tools" : "comment")} title="Comment settings and more tools" aria-label="More tools">
        <Ellipsis size={17} />
      </button>
    </div>
  );
}
