import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./App.css";
import { setPreference } from "./theme/index";

setPreference("system");

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
