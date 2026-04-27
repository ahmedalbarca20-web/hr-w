import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PageLoader } from '../components/common/Loader';

export default function PrivateRoute({ children }) {
  const { isAuth, initializing } = useAuth();
  const location = useLocation();

  // Wait until we have verified (or failed to verify) the stored session
  if (initializing) return <PageLoader />;

  if (!isAuth) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  return children;
}

