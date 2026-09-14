import { useEffect, useRef, useState } from "react";
import { shortcut } from "../lib/platform";
import { useApp, type Modal } from "../store";
import { SignatureDialog } from "./SignatureDialog";

function PasswordModal({ modal }: { modal: Extract<Modal, { kind: "password" }> }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="modal"
      role="dialog"
      aria-label="Password required"
      onSubmit={(e) => {
        e.preventDefault();
        modal.resolve(value);
      }}
    >
      <h3>Password required</h3>
      <p className="modal__text">
        <strong>{modal.name}</strong> is protected. Enter the password to open it.
      </p>
      {modal.wrong && <p className="modal__error">Incorrect password. Please try again.</p>}
      <input className="input" type="password" autoFocus value={value} onChange={(e) => setValue(e.target.value)} aria-label="Password" />
      <div className="modal__row">
        <span className="modal__spacer" />
        <button type="button" className="btn" onClick={() => modal.resolve(null)}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          Open
        </button>
      </div>
    </form>
  );
}

function TextModal({ modal }: { modal: Extract<Modal, { kind: "text" }> }) {
  const [value, setValue] = useState(modal.defaultValue);
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  const submit = () => modal.resolve(value);
  return (
    <form
      className="modal"
      role="dialog"
      aria-label={modal.title}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <h3>{modal.title}</h3>
      <label className="field">
        <span className="field__label">{modal.label}</span>
        {modal.multiline ? (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            className="input"
            rows={5}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
            }}
          />
        ) : (
          <input ref={ref as React.RefObject<HTMLInputElement>} className="input" value={value} onChange={(e) => setValue(e.target.value)} />
        )}
      </label>
      {modal.multiline && <p className="panel__hint">{shortcut("Ctrl+Enter")} to confirm.</p>}
      <div className="modal__row">
        <span className="modal__spacer" />
        <button type="button" className="btn" onClick={() => modal.resolve(null)}>
          Cancel
        </button>
        <button type="submit" className="btn btn--primary">
          OK
        </button>
      </div>
    </form>
  );
}

function InfoModal({ modal }: { modal: Extract<Modal, { kind: "info" }> }) {
  const close = () => useApp.getState().setModal(null);
  return (
    <div className="modal" role="dialog" aria-label={modal.title}>
      <h3>{modal.title}</h3>
      <table className="infoTable">
        <tbody>
          {modal.rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="modal__row">
        <span className="modal__spacer" />
        <button className="btn btn--primary" onClick={close} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}

function AboutModal() {
  const close = () => useApp.getState().setModal(null);
  return (
    <div className="modal" role="dialog" aria-label="About Folio PDF">
      <div className="about">
        <div className="home__mark" aria-hidden="true" />
        <div>
          <h3>Folio PDF</h3>
          <p className="modal__text">Version 0.1.0</p>
        </div>
      </div>
      <p className="modal__text">A lightweight desktop PDF viewer and editor. Rendering by pdf.js, document editing by pdf-lib, packaged with Tauri.</p>
      <h4>Keyboard shortcuts</h4>
      <table className="infoTable infoTable--compact">
        <tbody>
          {[
            ["Ctrl+O", "Open"],
            ["Ctrl+S / Ctrl+Shift+S", "Save / Save as"],
            ["Ctrl+P", "Print"],
            ["Ctrl+F", "Find"],
            ["Ctrl+W", "Close document"],
            ["Ctrl++ / Ctrl+-", "Zoom in / out"],
            ["Ctrl+0 / Ctrl+1 / Ctrl+2", "Fit page / actual size / fit width"],
            ["Ctrl+Tab", "Next document"],
            ["Ctrl+Z / Ctrl+Y", "Undo / redo annotation"],
            ["Delete", "Remove selected annotation"],
            ["Esc", "Back to the select tool"],
          ].map(([k, v]) => (
            <tr key={k}>
              <th>{k.split(" / ").map(shortcut).join(" / ")}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="modal__row">
        <span className="modal__spacer" />
        <button className="btn btn--primary" onClick={close} autoFocus>
          Close
        </button>
      </div>
    </div>
  );
}

export function Modals() {
  const modal = useApp((s) => s.modal);
  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      if ("resolve" in modal) modal.resolve(null);
      else useApp.getState().setModal(null);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [modal]);
  if (!modal) return null;
  let body: React.ReactNode;
  switch (modal.kind) {
    case "password":
      body = <PasswordModal modal={modal} />;
      break;
    case "text":
      body = <TextModal modal={modal} />;
      break;
    case "signature":
      body = <SignatureDialog onDone={modal.resolve} />;
      break;
    case "info":
      body = <InfoModal modal={modal} />;
      break;
    case "about":
      body = <AboutModal />;
      break;
  }
  return <div className="backdrop">{body}</div>;
}

export function BusyOverlay() {
  const busy = useApp((s) => s.busy);
  if (!busy) return null;
  return (
    <div className="backdrop backdrop--busy" aria-live="polite">
      <div className="busy">
        <div className="spinner" />
        <span>{busy}</span>
      </div>
    </div>
  );
}

export function Toasts() {
  const toasts = useApp((s) => s.toasts);
  const dismiss = useApp((s) => s.dismissToast);
  if (!toasts.length) return null;
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <button key={t.id} className={"toast toast--" + t.kind} onClick={() => dismiss(t.id)}>
          {t.text}
        </button>
      ))}
    </div>
  );
}
