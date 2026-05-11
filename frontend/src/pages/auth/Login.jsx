import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../context/AuthContext';
import { useLang } from '../../context/LangContext';
import Alert from '../../components/common/Alert';
import Button from '../../components/common/Button';
import clsx from 'clsx';

export default function Login({ initialMode = 'company' }) {
  const { t }           = useTranslation();
  const { login, loginEmployee } = useAuth();
  const { lang, toggleLang } = useLang();
  const navigate        = useNavigate();
  const [error, setError] = useState('');
  const [mode, setMode] = useState(initialMode);
  const [showPassword, setShowPassword] = useState(false);

  /** Shown in employee-login hint; match backend EMPLOYEE_DEFAULT_PASSWORD when set. */
  const defaultEmployeePwdHint = String(import.meta.env.VITE_EMPLOYEE_DEFAULT_PASSWORD || '11223344').trim() || '11223344';

  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm();

  const onSubmit = async (form) => {
    setError('');
    const code = (form.company_code || '').trim() || null;
    const res = mode === 'company'
      ? await login(form.email?.trim(), form.password, { company_code: code })
      : await loginEmployee((form.employee_code || '').trim(), form.password, code);
    if (res.ok) {
      try {
        const raw = localStorage.getItem('user');
        const u = raw ? JSON.parse(raw) : null;
        if (u?.onboarding_required) navigate('/setup', { replace: true });
        else navigate('/', { replace: true });
      } catch {
        navigate('/', { replace: true });
      }
    }
    else setError(res.msg);
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-hero">
          <div className="sidebar-brand-icon mx-auto mb-3 flex size-14 items-center justify-center rounded-xl">
            <span className="material-icons-round text-white text-3xl">fingerprint</span>
          </div>
          <h1 className="text-xl font-semibold">{t('app_name')}</h1>
          <p className="mt-1 text-sm text-white/70">{t('auth.login_hint')}</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="auth-form" noValidate>
          {error && (
            <div>
              <Alert type="danger" message={error} onClose={() => setError('')} />
            </div>
          )}

          <div className="flex gap-1 rounded-xl bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setMode('company')}
              className={clsx(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition',
                mode === 'company'
                  ? 'bg-white text-gray-800 shadow-sm ring-1 ring-brand/15'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t('auth.company_login')}
            </button>
            <button
              type="button"
              onClick={() => setMode('employee')}
              className={clsx(
                'flex-1 rounded-lg py-2 text-sm font-semibold transition',
                mode === 'employee'
                  ? 'bg-white text-gray-800 shadow-sm ring-1 ring-brand/15'
                  : 'text-gray-500 hover:text-gray-700',
              )}
            >
              {t('auth.employee_login')}
            </button>
          </div>
            <div>
              <label className="label">{t('auth.company_code')}</label>
              <input
                type="text"
                autoComplete="organization"
                placeholder="COMP-1234"
                dir="ltr"
                style={{ unicodeBidi: 'plaintext' }}
                className={clsx('input text-left', errors.company_code && 'border-danger focus:ring-danger/40')}
                {...register('company_code')}
              />
            </div>

            {mode === 'company' ? (
              <div>
                <label className="label">{t('auth.email')}</label>
                <div className="relative">
                  <span
                    className="material-icons-round pointer-events-none absolute start-3 top-1/2
                               -translate-y-1/2 text-xl text-gray-400"
                  >
                    email
                  </span>
                  <input
                    type="email"
                    autoComplete="email"
                    placeholder="admin@company.com"
                    className={clsx(
                      'input ps-10',
                      errors.email && 'border-danger focus:ring-danger/40',
                    )}
                    {...register('email', { required: mode === 'company' ? 'Email required' : false })}
                  />
                </div>
                {errors.email && (
                  <p className="mt-1 text-xs text-danger">{errors.email.message}</p>
                )}
              </div>
            ) : (
              <div>
                <label className="label">{t('auth.employee_code')}</label>
                <div className="relative">
                  <span
                    className="material-icons-round pointer-events-none absolute start-3 top-1/2
                               -translate-y-1/2 text-xl text-gray-400"
                  >
                    badge
                  </span>
                  <input
                    type="text"
                    autoComplete="username"
                    placeholder="EMP-001"
                    className={clsx(
                      'input ps-10',
                      errors.employee_code && 'border-danger focus:ring-danger/40',
                    )}
                    {...register('employee_code', { required: mode === 'employee' ? 'Employee code required' : false })}
                  />
                </div>
                {errors.employee_code && (
                  <p className="mt-1 text-xs text-danger">{errors.employee_code.message}</p>
                )}
              </div>
            )}

            <div>
              <label className="label">{t('auth.password')}</label>
              <div className="relative">
                <span
                  className="material-icons-round pointer-events-none absolute start-3 top-1/2
                             -translate-y-1/2 text-xl text-gray-400"
                >
                  lock_outline
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={clsx(
                    'input ps-10 pe-10',
                    errors.password && 'border-danger focus:ring-danger/40',
                  )}
                  {...register('password', { required: 'Password required' })}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  className="absolute end-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? t('auth.hide_password') : t('auth.show_password')}
                  title={showPassword ? t('auth.hide_password') : t('auth.show_password')}
                >
                  <span className="material-icons-round text-xl">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
              {errors.password && (
                <p className="mt-1 text-xs text-danger">{errors.password.message}</p>
              )}
            </div>

            {mode === 'employee' && (
              <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
                {t('auth.employee_portal_hint', { defaultPassword: defaultEmployeePwdHint })}
              </p>
            )}

          <Button
            type="submit"
            variant="primary"
            loading={isSubmitting}
            className="w-full justify-center py-2.5"
          >
            {mode === 'company'
              ? t('auth.login_company_button')
              : t('auth.login_employee_button')}
          </Button>
        </form>
      </div>

      <button type="button" onClick={toggleLang} className="auth-lang-btn">
        {lang === 'ar' ? 'Switch to English' : 'التبديل إلى العربية'}
      </button>
    </div>
  );
}
