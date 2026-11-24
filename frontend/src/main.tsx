import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes, useSearchParams, useLocation } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import "reactflow/dist/style.css";

import { ProtectedRoute } from "./components/ProtectedRoute";
import { PublicOnlyRoute } from "./components/PublicOnlyRoute";
import { ToastProvider } from "./context/ToastContext";
import "./index.css";
import { AppShell } from "./layouts/AppShell";
import { MarketingLayout } from "./layouts/MarketingLayout";
import { ConnectionsPage } from "./pages/ConnectionsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DatasetExplorerPage } from "./pages/DatasetExplorerPage";
import { ForgotPasswordPage } from "./pages/ForgotPasswordPage";
import { ApiKeysPage } from "./pages/ApiKeysPage";
import { AuditTrailPage } from "./pages/AuditTrailPage";
import { RolesPage } from "./pages/RolesPage";
import { BillingPage } from "./pages/BillingPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TemplateLibraryPage } from "./pages/TemplateLibraryPage";
import { JobsMonitorPage } from "./pages/JobsMonitorPage";
import { RoutingCenterPage } from "./pages/RoutingCenterPage";
import { LoginPage } from "./pages/LoginPage";
import { ObservabilityPage } from "./pages/ObservabilityPage";
import { PipelinesPage } from "./pages/PipelinesPage";
import { PipelineBuilderPage } from "./pages/PipelineBuilderPage";
import { PricingPage } from "./pages/PricingPage";
import { SchemaEditorPage } from "./pages/SchemaEditorPage";
import { SignupPage } from "./pages/SignupPage";
import { WorkspacesPage } from "./pages/WorkspacesPage";
import { LandingPage } from "./pages/marketing/LandingPage";
import { OverviewPage } from "./pages/marketing/OverviewPage";
import { PhilosophyPage } from "./pages/marketing/PhilosophyPage";
import { ProductPage } from "./pages/marketing/ProductPage";
import { useSessionStore } from "./store/session";

const queryClient = new QueryClient();

function LegacyLineageRedirect() {
  const [searchParams] = useSearchParams();
  const job = searchParams.get("job");
  const target = job ? `/jobs-monitor?lineage=1&job=${encodeURIComponent(job)}` : "/jobs-monitor?lineage=1";
  return <Navigate to={target} replace />;
}


function HashScrollManager() {
  const location = useLocation();
  React.useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1);
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [location.hash]);
  return null;
}

function AppRouter() {
  const restoreSession = useSessionStore((state) => state.restoreSession);

  React.useEffect(() => {
    // Disable session restoration for static deployment
    // void restoreSession();
  }, [restoreSession]);

  return (
    <BrowserRouter>
      <HashScrollManager />
      <Routes>
        <Route element={<PublicOnlyRoute />}>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        </Route>
        <Route element={<MarketingLayout />}>
          <Route path="/" element={<LandingPage />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/product" element={<ProductPage />} />
          <Route path="/philosophy" element={<PhilosophyPage />} />
          <Route path="/pricing" element={<PricingPage />} />
        </Route>
        <Route element={<ProtectedRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/workspaces" element={<WorkspacesPage />} />
            <Route path="/connections" element={<ConnectionsPage />} />
            <Route path="/pipelines" element={<PipelinesPage />} />
            <Route path="/pipeline-builder" element={<PipelineBuilderPage />} />
            <Route path="/dataset-explorer" element={<DatasetExplorerPage />} />
            <Route path="/schema-editor" element={<SchemaEditorPage />} />
            <Route path="/jobs-monitor" element={<JobsMonitorPage />} />
            <Route path="/lineage-graph" element={<LegacyLineageRedirect />} />
            <Route path="/observability" element={<ObservabilityPage />} />
            <Route path="/routing-center" element={<RoutingCenterPage />} />
            <Route path="/template-library" element={<TemplateLibraryPage />} />
            <Route path="/roles" element={<RolesPage />} />
            <Route path="/api-keys" element={<ApiKeysPage />} />
            <Route path="/audit-trail" element={<AuditTrailPage />} />
            <Route path="/billing" element={<BillingPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <AppRouter />
        </ToastProvider>
      </QueryClientProvider>
    </HelmetProvider>
  </React.StrictMode>
);
