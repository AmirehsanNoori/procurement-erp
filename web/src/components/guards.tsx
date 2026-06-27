import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/** Redirect to /login when not authenticated. */
export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-slate-500">
        در حال بارگذاری...
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Show a "no access" notice if the user lacks the required permission. */
export function RequirePermission({
  permission,
  children,
}: {
  permission: string;
  children: ReactNode;
}) {
  const { can } = useAuth();
  if (!can(permission)) {
    return (
      <div className="card mx-auto mt-10 max-w-md text-center text-slate-500">
        <div className="mb-2 text-3xl">🔒</div>
        به این بخش دسترسی ندارید.
      </div>
    );
  }
  return <>{children}</>;
}
