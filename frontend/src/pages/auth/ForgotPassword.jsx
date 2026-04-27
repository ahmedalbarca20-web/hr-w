import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { requestPasswordReset } from '../../api/auth.api';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';

export default function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [alert, setAlert] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setAlert(null);
    try {
      await requestPasswordReset(email);
      setAlert({ type: 'success', msg: t('auth.reset_email_sent', 'Password reset email sent') });
    } catch (err) {
      setAlert({
        type: 'danger',
        msg: err.response?.data?.error || t('auth.reset_failed', 'Failed to send reset email'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-hero">
          <div className="sidebar-brand-icon mx-auto mb-3 flex size-14 items-center justify-center rounded-xl">
            <span className="material-icons-round text-white text-3xl">lock_reset</span>
          </div>
          <h1 className="text-xl font-semibold">{t('auth.forgot_password', 'Forgot Password')}</h1>
          <p className="mt-1 text-sm text-white/70">{t('auth.reset_intro', 'We will email you a reset link.')}</p>
        </div>

        <div className="auth-form">
          {alert && (
            <div className="mb-2">
              <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="label">{t('auth.email', 'Email')}</label>
              <div className="relative">
                <span className="material-icons-round pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-xl text-gray-400">
                  email
                </span>
                <input
                  type="email"
                  className="input ps-10"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder={t('auth.enter_email', 'Enter your email')}
                />
              </div>
            </div>

            <Button type="submit" variant="primary" className="w-full justify-center py-2.5" loading={loading}>
              {t('auth.send_reset_link', 'Send Reset Link')}
            </Button>
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 border-t border-gray-100 pt-6 text-sm">
            <Link to="/login" className="font-medium text-brand-600 hover:text-brand-700">
              {t('auth.back_to_login', 'Back to Login')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
