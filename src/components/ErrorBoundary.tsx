import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Optional label shown in the fallback, e.g. the document name. */
  label?: string;
}

interface State {
  error: Error | null;
}

/** Keeps a crash in one part of the UI (typically a viewer) from blanking the whole window. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error): void {
    console.error("UI error", error);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="viewerOverlay viewerOverlay--error">
        <strong>Something went wrong{this.props.label ? ` in ${this.props.label}` : ""}</strong>
        <span>{this.state.error.message}</span>
        <button className="btn" onClick={() => this.setState({ error: null })}>
          Try again
        </button>
      </div>
    );
  }
}
