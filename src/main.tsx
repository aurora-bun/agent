import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Development hook so the app can be driven from the DevTools console / CDP.
if (import.meta.env.DEV) {
  Promise.all([import("./app/actions"), import("./app/viewers"), import("./store"), import("./lib/pdfops"), import("./lib/tauri")]).then(
    ([actions, viewers, store, pdfops, files]) => {
      (window as unknown as { __folio: unknown }).__folio = { actions, viewers, store: store.useApp, pdfops, files };
    },
  );
}
