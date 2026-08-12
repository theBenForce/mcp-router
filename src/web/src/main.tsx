import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { getApiUrl } from "./lib/api";

// Intercept global fetch calls to automatically route relative /api paths to backend port in Tauri desktop mode
const nativeFetch = window.fetch;
window.fetch = function (input: RequestInfo | URL, init?: RequestInit) {
  if (typeof input === "string" && (input.startsWith("/") || input.startsWith("api/"))) {
    return nativeFetch(getApiUrl(input), init);
  } else if (input instanceof URL && (input.pathname.startsWith("/") || input.pathname.startsWith("api/"))) {
    return nativeFetch(getApiUrl(input.pathname + input.search), init);
  }
  return nativeFetch(input, init);
};

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


