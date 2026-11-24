import { Navigate, Outlet, useLocation } from "react-router-dom";

import { useSessionStore } from "../store/session";

export function ProtectedRoute() {
  const location = useLocation();
  const { initialized, isLoading, token } = useSessionStore();

  // For static deployment, allow access without authentication
  // Comment out the authentication checks
  /*
  if (!initialized || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-sm text-slate-600">
        Restoring secure session...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  */

  return <Outlet />;
}
