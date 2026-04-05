import * as React from "react";
import { StrictMode } from "react";
import * as ReactDOM from "react-dom";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "@/lib/router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { App } from "./App";
import { CompanyProvider } from "./context/CompanyContext";
import { LiveUpdatesProvider } from "./context/LiveUpdatesProvider";
import { BreadcrumbProvider } from "./context/BreadcrumbContext";
import { PanelProvider } from "./context/PanelContext";
import { SidebarProvider } from "./context/SidebarContext";
import { DialogProvider } from "./context/DialogContext";
import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { initPluginBridge } from "./plugins/bridge-init";
import { PluginLauncherProvider } from "./plugins/launchers";
import "@mdxeditor/editor/style.css";
import "./i18n";
import "./index.css";

initPluginBridge(React, ReactDOM);

// Service worker registration intentionally removed.
// public/sw.js is now a kill-switch that unregisters itself on activation;
// previously-installed workers will self-destruct on their next update check
// (Cache-Control: max-age=0 guarantees this happens on the next reload).
// We can reintroduce a versioned worker later if we need offline support.
if ("serviceWorker" in navigator) {
  // Also proactively unregister any existing registration on this tab, so the
  // first reload after shipping this change clears everything without needing
  // the kill-switch worker to also activate. Both paths end in the same state.
  navigator.serviceWorker.getRegistrations?.().then((regs) => {
    for (const reg of regs) {
      reg.unregister().catch(() => {
        /* ignored */
      });
    }
  });
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: true,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <CompanyProvider>
            <ToastProvider>
              <LiveUpdatesProvider>
                <TooltipProvider>
                  <BreadcrumbProvider>
                    <SidebarProvider>
                      <PanelProvider>
                        <PluginLauncherProvider>
                          <DialogProvider>
                            <App />
                          </DialogProvider>
                        </PluginLauncherProvider>
                      </PanelProvider>
                    </SidebarProvider>
                  </BreadcrumbProvider>
                </TooltipProvider>
              </LiveUpdatesProvider>
            </ToastProvider>
          </CompanyProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>
);
