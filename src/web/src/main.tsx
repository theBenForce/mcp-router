import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";
import { getApiUrl } from "./lib/api";

// Intercept global fetch calls to automatically route relative /api paths to backend port in Tauri desktop mode
const nativeFetch = window.fetch.bind(window);
window.fetch = Object.assign(
  function (input: RequestInfo | URL, init?: RequestInit) {
    let urlString: string | null = null;
    if (typeof input === "string") {
      urlString = input;
    } else if (input instanceof URL) {
      urlString = input.pathname + input.search;
    }

    if (
      urlString &&
      (urlString.startsWith("/api") || urlString.startsWith("api/") || urlString.startsWith("/health"))
    ) {
      return nativeFetch(getApiUrl(urlString), init);
    }
    return nativeFetch(input, init);
  },
  nativeFetch
);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);


