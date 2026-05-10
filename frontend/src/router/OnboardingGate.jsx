import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function needsWizard(user) {
  if (!user) return false;
  if (user.is_super_admin || user.role === 'SUPER_ADMIN') return false;
  if (user.role === 'EMPLOYEE') return false;
  return Boolean(user.onboarding_required);
}

export default function OnboardingGate({ children }) {
  const { user, initializing } = useAuth();
  const location = useLocation();

  if (initializing) return children;

  const path = location.pathname;
  const onSetup = path === '/setup' || path.startsWith('/setup/');

  if (needsWizard(user) && !onSetup) {
    return <Navigate to="/setup" replace />;
  }
  if (!needsWizard(user) && onSetup) {
    return <Navigate to="/" replace />;
  }
  return children;
}
