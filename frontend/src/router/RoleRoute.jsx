import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function RoleRoute({ children, roles }) {
  const { user } = useAuth();

  const roleName =
    typeof user?.role === 'object'
      ? (user.role?.name ?? '')
      : (user?.role ?? '');

  const isSuperAdmin = Boolean(user?.is_super_admin) || roleName === 'SUPER_ADMIN';

  // Super admin can access all guarded pages
  if (isSuperAdmin) return children;

  // If no role restriction provided, allow by default
  if (!Array.isArray(roles) || roles.length === 0) return children;

  if (!roles.includes(roleName)) {
    return <Navigate to="/" replace />;
  }
  return children;
}

