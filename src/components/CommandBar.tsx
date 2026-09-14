import { useState } from "react";
import { PenTool, Printer, Save, Search } from "lucide-react";
import { printTab, saveTab } from "../app/actions";
import { shortcut } from "../lib/platform";
import { useActiveTab, useApp, type ToolPanel } from "../store";

type Mode = "tools" | "read" | "edit" | "convert" | "sign";

const PANEL_MODE: Record<NonNullable<ToolPanel>, Mode> = {
  tools: "tools",
  comment: "edit",
  organize: "edit",
  fillsign: "sign",
  combine: "convert",
  convert: "convert",
};

/** Second row: Acrobat-style category tabs, search and document actions. */
export function CommandBar() {
  const tab = useActiveTab();
  const toolPanel = useApp((s) => s.toolPanel);
  const setToolPanel = useApp((s) => s.setToolPanel);
  const setNavPanel = useApp((s) => s.setNavPanel);
  const setTool = useApp((s) => s.setTool);
  const setPendingFind = useApp((s) => s.setPendingFind);
  const view = useApp((s) => s.view);
  const [query, setQuery] = useState("");
  const ready = !!tab?.pdf;
  const mode: Mode = view === "home" ? "tools" : toolPanel ? PANEL_MODE[toolPanel] : "read";

  const tabs: Array<{ id: Mode; label: string; onClick: () => void; disabled?: boolean }> = [
    { id: "tools", label: "All tools", onClick: () => setToolPanel(toolPanel === "tools" && view === "doc" ? null : "tools") },
    {
      id: "read",
      label: "Read",
      onClick: () => {
        setToolPanel(null);
        setNavPanel(null);
        setTool("select");
        useApp.getState().setView("doc");
      },
    },
    { id: "edit", label: "Edit", onClick: () => setToolPanel("organize"), disabled: !ready },
    { id: "convert", label: "Convert", onClick: () => setToolPanel("convert") },
    { id: "sign", label: "Sign", onClick: () => setToolPanel("fillsign"), disabled: !ready },
  ];

  const submitFind = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready) return;
    setPendingFind(query);
    setNavPanel("search");
  };

  return (
    <div className="cmdbar">
      <nav className="cmdbar__tabs" aria-label="Sections">
        {tabs.map((t) => (
          <button key={t.id} className={"cmdbar__tab" + (mode === t.id ? " is-active" : "")} onClick={t.onClick} disabled={t.disabled}>
            {t.label}
          </button>
        ))}
      </nav>
      <div className="cmdbar__spacer" />
      <div className="cmdbar__actions">
        <form className="cmdbar__search" onSubmit={submitFind} role="search">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find text in document"
            disabled={!ready}
            aria-label="Find text"
          />
          <button type="submit" className="cmdbar__searchBtn" disabled={!ready} aria-label="Find" title={`Find (${shortcut("Ctrl+F")})`}>
            <Search size={15} />
          </button>
        </form>
        <button className="iconBtn" onClick={() => tab && printTab(tab.id)} disabled={!ready} title={`Print (${shortcut("Ctrl+P")})`} aria-label="Print">
          <Printer size={17} />
        </button>
        <button className="pill pill--dark" onClick={() => tab && saveTab(tab.id)} disabled={!ready} title={`Save (${shortcut("Ctrl+S")})`}>
          <Save size={14} /> Save{tab?.dirty ? " •" : ""}
        </button>
        <button className="pill pill--accent" onClick={() => setToolPanel("fillsign")} disabled={!ready}>
          <PenTool size={14} /> Fill & Sign
        </button>
      </div>
    </div>
  );
}
