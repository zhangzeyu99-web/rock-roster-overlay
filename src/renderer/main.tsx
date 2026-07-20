import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { FloatingControlPage } from "./FloatingControlPage";
import { OverlayPage } from "./OverlayPage";
import "./styles.css";

const root = createRoot(document.getElementById("root")!);

if (window.location.pathname.startsWith("/overlay/")) {
  root.render(
    <React.StrictMode>
      <OverlayPage />
    </React.StrictMode>
  );
} else if (window.location.pathname.startsWith("/control") || window.location.hash === "#/control") {
  root.render(
    <React.StrictMode>
      <FloatingControlPage />
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
}
