import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { router } from "./router";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </HelmetProvider>
  </React.StrictMode>
);
