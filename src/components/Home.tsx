import { Clock, Combine, FolderOpen, ImagePlus, X } from "lucide-react";
import { createPdfFromImages, openFileDialog, openPath } from "../app/actions";
import { baseName, dirName } from "../lib/tauri";
import { useApp } from "../store";

export function Home() {
  const recent = useApp((s) => s.recent);
  const removeRecent = useApp((s) => s.removeRecent);
  const setToolPanel = useApp((s) => s.setToolPanel);
  return (
    <div className="home">
      <div className="home__inner">
        <div className="home__hero">
          <div className="home__mark" aria-hidden="true" />
          <div>
            <h1>Folio PDF</h1>
            <p>View, comment, organize, sign and combine PDF documents.</p>
          </div>
        </div>

        <div className="home__actions">
          <button className="btn btn--primary btn--lg" onClick={openFileDialog}>
            <FolderOpen size={18} /> Open PDF…
          </button>
          <button className="btn btn--lg" onClick={() => setToolPanel("combine")}>
            <Combine size={18} /> Combine files
          </button>
          <button className="btn btn--lg" onClick={() => createPdfFromImages()}>
            <ImagePlus size={18} /> Images to PDF
          </button>
        </div>
        <p className="home__drop">…or drop PDF files anywhere in this window.</p>

        <section className="home__recent">
          <h2>
            <Clock size={15} /> Recent
          </h2>
          {recent.length === 0 && <p className="panel__hint">Files you open will be listed here.</p>}
          <ul>
            {recent.map((p) => (
              <li key={p} className="recentItem">
                <button className="recentItem__open" onClick={() => openPath(p)} title={p}>
                  <span className="recentItem__name">{baseName(p)}</span>
                  <span className="recentItem__dir">{dirName(p)}</span>
                </button>
                <button className="iconBtn iconBtn--sm" onClick={() => removeRecent(p)} aria-label="Remove from recent" title="Remove from list">
                  <X size={14} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
