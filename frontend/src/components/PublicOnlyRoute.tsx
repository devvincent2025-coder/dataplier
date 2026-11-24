import { Navigate, Outlet } from "react-router-dom";

import { AuthPublicSeo } from "./seo/AuthPublicSeo";
import { useSessionStore } from "../store/session";

export function PublicOnlyRoute() {
  const { initialized, isLoading, token } = useSessionStore();

  // For static deployment, allow access without authentication checks
  // Comment out the authentication checks
  /*
  if (!initialized || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-600">
        Loading access state...
      </div>
    );
  }

  if (token) {
    return <Navigate to="/dashboard" replace />;
  }
  */

  return (
    <>
      <AuthPublicSeo />
      <Outlet />
    </>
  );
}
