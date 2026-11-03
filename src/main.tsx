import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { initLog } from "./lib/log";
import { registerGlobalErrorHandlers } from "./lib/registerGlobalErrorHandlers";
import "./index.css";

initLog();
registerGlobalErrorHandlers();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

ReactDOM.createRoot(root, {
  // ErrorBoundary.componentDidCatch already logs caught render errors.
  // React's default handler would console.error them again, and initLog forwards that.
  onCaughtError: import.meta.env.DEV ? undefined : () => {},
}).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
