import { useState } from "react";
import { PenLine, Plus, Trash2, Type } from "lucide-react";
import { addImageStamp } from "../app/viewers";
import { askSignature, useApp } from "../store";
import { ToolPanelHeader } from "./ToolPanel";

const SIG_KEY = "folio.signatures";
const MAX_SIGNATURES = 5;

export function loadSignatures(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(SIG_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x.startsWith("data:image/")) : [];
  } catch {
    return [];
  }
}

function storeSignatures(list: string[]): void {
  try {
    localStorage.setItem(SIG_KEY, JSON.stringify(list.slice(0, MAX_SIGNATURES)));
  } catch {
    /* quota or privacy mode: keep in memory only */
  }
}

export function FillSignPanel() {
  const [signatures, setSignatures] = useState<string[]>(loadSignatures);
  const setTool = useApp((s) => s.setTool);
  const tool = useApp((s) => s.tool);
  const toast = useApp((s) => s.toast);

  const place = async (dataUrl: string) => {
    setTool("image");
    const ok = await addImageStamp(dataUrl);
    toast(ok ? "Signature placed — drag it into position, drag a corner to resize" : "Could not place the signature", ok ? "info" : "error");
  };

  const create = async () => {
    const dataUrl = await askSignature();
    if (!dataUrl) return;
    const next = [dataUrl, ...signatures.filter((s) => s !== dataUrl)].slice(0, MAX_SIGNATURES);
    setSignatures(next);
    storeSignatures(next);
    place(dataUrl);
  };

  const remove = (dataUrl: string) => {
    const next = signatures.filter((s) => s !== dataUrl);
    setSignatures(next);
    storeSignatures(next);
  };

  return (
    <div className="panel">
      <ToolPanelHeader title="Fill & Sign" />
      <div className="panel__body">
        <section className="section">
          <h4>Fill</h4>
          <p className="panel__hint">Form fields can be typed into directly. For documents without fields, add a text box:</p>
          <button className={"btn" + (tool === "text" ? " is-active" : "")} onClick={() => setTool(tool === "text" ? "select" : "text")}>
            <Type size={14} /> {tool === "text" ? "Adding text — click on the page" : "Add text"}
          </button>
        </section>

        <section className="section">
          <h4>Sign</h4>
          {signatures.length === 0 && <p className="panel__hint">No saved signatures yet. Draw, type or upload one; it is kept on this computer only.</p>}
          <div className="sigList">
            {signatures.map((s, i) => (
              <div key={i} className="sigItem">
                <button className="sigItem__img" onClick={() => place(s)} title="Place this signature on the current page">
                  <img src={s} alt={`Signature ${i + 1}`} />
                </button>
                <button className="iconBtn iconBtn--sm" onClick={() => remove(s)} aria-label="Delete signature" title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
          <button className="btn btn--primary" onClick={create} disabled={signatures.length >= MAX_SIGNATURES}>
            <Plus size={14} /> Create signature
          </button>
          <p className="panel__hint">
            <PenLine size={12} /> Click a saved signature to place it on the page you are viewing. Move and resize it, then save the document.
          </p>
        </section>
      </div>
    </div>
  );
}
