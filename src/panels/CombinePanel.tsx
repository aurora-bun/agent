import { useState } from "react";
import { ArrowDown, ArrowUp, FilePlus2, Trash2 } from "lucide-react";
import { combinePaths } from "../app/actions";
import { baseName, pickPdfs } from "../lib/tauri";
import { useActiveTab } from "../store";
import { ToolPanelHeader } from "./ToolPanel";

export function CombinePanel() {
  const tab = useActiveTab();
  const [files, setFiles] = useState<string[]>(() => (tab?.path ? [tab.path] : []));

  const add = async () => {
    const picked = await pickPdfs(true);
    if (!picked.length) return;
    setFiles((f) => [...f, ...picked.filter((p) => !f.includes(p))]);
  };
  const move = (i: number, dir: -1 | 1) => {
    setFiles((f) => {
      const j = i + dir;
      if (j < 0 || j >= f.length) return f;
      const next = [...f];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  return (
    <div className="panel">
      <ToolPanelHeader title="Combine files" />
      <div className="panel__body">
        <p className="panel__hint">Add PDF files in the order they should appear. The result opens as a new, unsaved document.</p>
        <button className="btn" onClick={add}>
          <FilePlus2 size={14} /> Add files…
        </button>
        <ol className="fileList">
          {files.map((p, i) => (
            <li key={p} className="fileList__item" title={p}>
              <span className="fileList__name">{baseName(p)}</span>
              <span className="fileList__actions">
                <button className="iconBtn iconBtn--sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                  <ArrowUp size={13} />
                </button>
                <button className="iconBtn iconBtn--sm" onClick={() => move(i, 1)} disabled={i === files.length - 1} aria-label="Move down">
                  <ArrowDown size={13} />
                </button>
                <button className="iconBtn iconBtn--sm" onClick={() => setFiles((f) => f.filter((x) => x !== p))} aria-label="Remove">
                  <Trash2 size={13} />
                </button>
              </span>
            </li>
          ))}
        </ol>
        <button className="btn btn--primary" disabled={files.length < 2} onClick={() => combinePaths(files)}>
          Combine {files.length > 1 ? `${files.length} files` : ""}
        </button>
      </div>
    </div>
  );
}
