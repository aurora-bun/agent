import { useState } from "react";
import { Highlighter, Image as ImageIcon, MousePointer2, PenLine, Redo2, StickyNote, Trash2, Type, Undo2 } from "lucide-react";
import { AnnotationEditorParamsType } from "../lib/pdfjs";
import { activeViewer, editorDeleteSelection, editorRedo, editorUndo, setEditorParam } from "../app/viewers";
import { shortcut } from "../lib/platform";
import { useApp, type Tool } from "../store";
import { ToolPanelHeader } from "./ToolPanel";

const HIGHLIGHT_SWATCHES = ["#FFFF98", "#53FFBC", "#80EBFF", "#FFCBE6", "#FF4F5F"];
const INK_SWATCHES = ["#E3242B", "#1C6FE0", "#12A150", "#F59E0B", "#7C3AED", "#111111"];
const TEXT_SWATCHES = ["#111111", "#E3242B", "#1C6FE0", "#12A150"];

const AUTHOR_KEY = "folio.author";

/** Editor parameters, remembered for the session and re-applied on tool changes. */
const params = {
  highlightColor: HIGHLIGHT_SWATCHES[0],
  highlightThickness: 12,
  inkColor: INK_SWATCHES[0],
  inkThickness: 3,
  inkOpacity: 100,
  textColor: TEXT_SWATCHES[0],
  textSize: 12,
};

/**
 * Re-apply the remembered defaults for the given tool. pdf.js routes a
 * parameter to the selected annotation when there is one, so the selection
 * is cleared first to keep this from recolouring an existing annotation.
 */
export function pushEditorDefaults(tool: Tool): void {
  activeViewer()?.uiManager?.unselectAll();
  switch (tool) {
    case "highlight":
      setEditorParam(AnnotationEditorParamsType.HIGHLIGHT_COLOR, params.highlightColor);
      setEditorParam(AnnotationEditorParamsType.HIGHLIGHT_THICKNESS, params.highlightThickness);
      break;
    case "ink":
      setEditorParam(AnnotationEditorParamsType.INK_COLOR, params.inkColor);
      setEditorParam(AnnotationEditorParamsType.INK_THICKNESS, params.inkThickness);
      setEditorParam(AnnotationEditorParamsType.INK_OPACITY, params.inkOpacity / 100);
      break;
    case "text":
      setEditorParam(AnnotationEditorParamsType.FREETEXT_COLOR, params.textColor);
      setEditorParam(AnnotationEditorParamsType.FREETEXT_SIZE, params.textSize);
      break;
  }
}

const TOOLS: Array<{ id: Tool; label: string; icon: React.ReactNode; hint: string }> = [
  { id: "select", label: "Select", icon: <MousePointer2 size={18} />, hint: "Select text or move existing annotations." },
  { id: "highlight", label: "Highlight", icon: <Highlighter size={18} />, hint: "Drag across text to highlight it. Drag on an image or blank area for a free-form highlight." },
  { id: "ink", label: "Draw", icon: <PenLine size={18} />, hint: "Draw freehand on the page. Press Esc or switch tools to finish a stroke group." },
  { id: "text", label: "Text box", icon: <Type size={18} />, hint: "Click on the page to add a text box, then type." },
  { id: "note", label: "Sticky note", icon: <StickyNote size={18} />, hint: "Click where the note icon should appear, then enter the comment." },
  { id: "image", label: "Image", icon: <ImageIcon size={18} />, hint: "Click on the page, then choose a PNG or JPEG to place. Drag its corners to resize." },
];

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  return (
    <div className="swatches">
      {colors.map((c) => (
        <button
          key={c}
          className={"swatch" + (value.toLowerCase() === c.toLowerCase() ? " is-active" : "")}
          style={{ background: c }}
          onClick={() => onChange(c)}
          aria-label={c}
          title={c}
        />
      ))}
      <label className="swatch swatch--custom" title="Custom colour">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    </div>
  );
}

function Slider({ label, min, max, value, unit, onChange }: { label: string; min: number; max: number; value: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="field">
      <span className="field__label">
        {label} <em>{value}{unit ?? ""}</em>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export function CommentPanel() {
  const tool = useApp((s) => s.tool);
  const setTool = useApp((s) => s.setTool);
  const [, bump] = useState(0);
  const refresh = () => bump((n) => n + 1);
  const [author, setAuthor] = useState(() => {
    try {
      return localStorage.getItem(AUTHOR_KEY) || "";
    } catch {
      return "";
    }
  });

  const current = TOOLS.find((t) => t.id === tool);

  return (
    <div className="panel">
      <ToolPanelHeader title="Comment" />
      <div className="panel__body">
        <div className="toolGrid">
          {TOOLS.map((t) => (
            <button key={t.id} className={"toolBtn" + (tool === t.id ? " is-active" : "")} onClick={() => setTool(t.id)} title={t.hint}>
              {t.icon}
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        {current && <p className="panel__hint">{current.hint}</p>}

        {tool === "highlight" && (
          <section className="section">
            <h4>Highlight</h4>
            <Swatches
              colors={HIGHLIGHT_SWATCHES}
              value={params.highlightColor}
              onChange={(c) => {
                params.highlightColor = c;
                setEditorParam(AnnotationEditorParamsType.HIGHLIGHT_COLOR, c);
                refresh();
              }}
            />
            <Slider
              label="Free-form thickness"
              min={8}
              max={24}
              value={params.highlightThickness}
              onChange={(v) => {
                params.highlightThickness = v;
                setEditorParam(AnnotationEditorParamsType.HIGHLIGHT_THICKNESS, v);
                refresh();
              }}
            />
          </section>
        )}

        {tool === "ink" && (
          <section className="section">
            <h4>Pen</h4>
            <Swatches
              colors={INK_SWATCHES}
              value={params.inkColor}
              onChange={(c) => {
                params.inkColor = c;
                setEditorParam(AnnotationEditorParamsType.INK_COLOR, c);
                refresh();
              }}
            />
            <Slider
              label="Thickness"
              min={1}
              max={20}
              value={params.inkThickness}
              onChange={(v) => {
                params.inkThickness = v;
                setEditorParam(AnnotationEditorParamsType.INK_THICKNESS, v);
                refresh();
              }}
            />
            <Slider
              label="Opacity"
              min={5}
              max={100}
              unit="%"
              value={params.inkOpacity}
              onChange={(v) => {
                params.inkOpacity = v;
                setEditorParam(AnnotationEditorParamsType.INK_OPACITY, v / 100);
                refresh();
              }}
            />
          </section>
        )}

        {tool === "text" && (
          <section className="section">
            <h4>Text box</h4>
            <Swatches
              colors={TEXT_SWATCHES}
              value={params.textColor}
              onChange={(c) => {
                params.textColor = c;
                setEditorParam(AnnotationEditorParamsType.FREETEXT_COLOR, c);
                refresh();
              }}
            />
            <Slider
              label="Font size"
              min={6}
              max={48}
              unit=" pt"
              value={params.textSize}
              onChange={(v) => {
                params.textSize = v;
                setEditorParam(AnnotationEditorParamsType.FREETEXT_SIZE, v);
                refresh();
              }}
            />
          </section>
        )}

        {tool === "note" && (
          <section className="section">
            <h4>Sticky note</h4>
            <label className="field">
              <span className="field__label">Author</span>
              <input
                className="input"
                value={author}
                placeholder="Your name"
                onChange={(e) => {
                  setAuthor(e.target.value);
                  try {
                    localStorage.setItem(AUTHOR_KEY, e.target.value);
                  } catch {
                    /* ignore */
                  }
                }}
              />
            </label>
          </section>
        )}

        <section className="section">
          <h4>Edit</h4>
          <div className="btnRow">
            <button className="btn btn--sm" onClick={editorUndo} title={`Undo (${shortcut("Ctrl+Z")})`}>
              <Undo2 size={14} /> Undo
            </button>
            <button className="btn btn--sm" onClick={editorRedo} title={`Redo (${shortcut("Ctrl+Y")})`}>
              <Redo2 size={14} /> Redo
            </button>
            <button className="btn btn--sm" onClick={editorDeleteSelection} title="Delete selected annotation (Del)">
              <Trash2 size={14} /> Delete
            </button>
          </div>
          <p className="panel__hint">
            Click an annotation to select it, drag to move, drag the corner handles to resize. Annotations are written into the PDF when you save.
          </p>
        </section>
      </div>
    </div>
  );
}
