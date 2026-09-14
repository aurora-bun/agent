import { useState } from "react";
import { FileImage, Hash, ImagePlus, Stamp } from "lucide-react";
import { applyPageOp, createPdfFromImages, exportPagesAsImages } from "../app/actions";
import { addPageNumbers, addWatermark, type NumberPosition } from "../lib/pdfops";
import { useActiveTab } from "../store";
import { ToolPanelHeader } from "./ToolPanel";

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return [0.5, 0.5, 0.5];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

export function ConvertPanel() {
  const tab = useActiveTab();
  const docReady = !!tab?.pdf;
  const canRebuild = docReady && !tab?.encrypted;
  const [format, setFormat] = useState<"png" | "jpeg">("png");
  const [dpi, setDpi] = useState(150);
  const [numPos, setNumPos] = useState<NumberPosition>("bottom-center");
  const [numFormat, setNumFormat] = useState("{n}");
  const [numStart, setNumStart] = useState(1);
  const [wmText, setWmText] = useState("CONFIDENTIAL");
  const [wmOpacity, setWmOpacity] = useState(25);
  const [wmColor, setWmColor] = useState("#c0392b");
  const [wmDiagonal, setWmDiagonal] = useState(true);

  return (
    <div className="panel">
      <ToolPanelHeader title="Export & convert" />
      <div className="panel__body">
        <section className="section">
          <h4>
            <FileImage size={14} /> Pages to images
          </h4>
          <div className="fieldRow">
            <label className="field">
              <span className="field__label">Format</span>
              <select className="input" value={format} onChange={(e) => setFormat(e.target.value as "png" | "jpeg")}>
                <option value="png">PNG</option>
                <option value="jpeg">JPEG</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Resolution</span>
              <select className="input" value={dpi} onChange={(e) => setDpi(Number(e.target.value))}>
                <option value={72}>72 dpi</option>
                <option value={150}>150 dpi</option>
                <option value={300}>300 dpi</option>
              </select>
            </label>
          </div>
          <button className="btn" disabled={!docReady} onClick={() => tab && exportPagesAsImages(tab.id, format, dpi)}>
            Export all pages…
          </button>
        </section>

        <section className="section">
          <h4>
            <ImagePlus size={14} /> Images to PDF
          </h4>
          <p className="panel__hint">Each PNG or JPEG becomes one page of a new document.</p>
          <button className="btn" onClick={() => createPdfFromImages()}>
            Choose images…
          </button>
        </section>

        <section className="section">
          <h4>
            <Hash size={14} /> Page numbers
          </h4>
          <div className="fieldRow">
            <label className="field">
              <span className="field__label">Position</span>
              <select className="input" value={numPos} onChange={(e) => setNumPos(e.target.value as NumberPosition)}>
                <option value="bottom-center">Bottom centre</option>
                <option value="bottom-right">Bottom right</option>
                <option value="bottom-left">Bottom left</option>
                <option value="top-center">Top centre</option>
                <option value="top-right">Top right</option>
                <option value="top-left">Top left</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Start at</span>
              <input className="input" type="number" min={0} value={numStart} onChange={(e) => setNumStart(Number(e.target.value) || 0)} />
            </label>
          </div>
          <label className="field">
            <span className="field__label">Format</span>
            <select className="input" value={numFormat} onChange={(e) => setNumFormat(e.target.value)}>
              <option value="{n}">1</option>
              <option value="Page {n}">Page 1</option>
              <option value="{n} / {total}">1 / 10</option>
              <option value="Page {n} of {total}">Page 1 of 10</option>
            </select>
          </label>
          <button
            className="btn"
            disabled={!canRebuild}
            title={tab?.encrypted ? "Not available for encrypted documents" : undefined}
            onClick={() =>
              tab && applyPageOp(tab.id, "Adding page numbers…", (b) => addPageNumbers(b, { position: numPos, format: numFormat, start: numStart, fontSize: 10 }))
            }
          >
            Add page numbers
          </button>
        </section>

        <section className="section">
          <h4>
            <Stamp size={14} /> Watermark
          </h4>
          <label className="field">
            <span className="field__label">Text</span>
            <input className="input" value={wmText} onChange={(e) => setWmText(e.target.value)} />
          </label>
          <div className="fieldRow">
            <label className="field">
              <span className="field__label">
                Opacity <em>{wmOpacity}%</em>
              </span>
              <input type="range" min={5} max={100} value={wmOpacity} onChange={(e) => setWmOpacity(Number(e.target.value))} />
            </label>
            <label className="field field--narrow">
              <span className="field__label">Colour</span>
              <input type="color" value={wmColor} onChange={(e) => setWmColor(e.target.value)} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={wmDiagonal} onChange={(e) => setWmDiagonal(e.target.checked)} /> Diagonal
          </label>
          <button
            className="btn"
            disabled={!canRebuild || !wmText.trim()}
            title={tab?.encrypted ? "Not available for encrypted documents" : undefined}
            onClick={() =>
              tab &&
              applyPageOp(tab.id, "Adding watermark…", (b) =>
                addWatermark(b, { text: wmText.trim(), fontSize: 64, opacity: wmOpacity / 100, color: hexToRgb(wmColor), diagonal: wmDiagonal }),
              )
            }
          >
            Add watermark
          </button>
        </section>
      </div>
    </div>
  );
}
