import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/common/ErrorBoundary";
import { initLog } from "./lib/log";
import "./index.css";

initLog();

const root = document.getElementById("root");
if (!root) {
  throw new Error("Missing #root element");
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
);
