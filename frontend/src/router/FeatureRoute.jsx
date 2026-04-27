import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function FeatureRoute({ children, feature }) {
  const { user, hasFeature } = useAuth();
  const isSuperAdmin = Boolean(user?.is_super_admin) || user?.role === 'SUPER_ADMIN';

  if (isSuperAdmin) return children;
  if (!feature) return children;
  if (hasFeature(feature)) return children;

  return <Navigate to="/" replace />;
}
