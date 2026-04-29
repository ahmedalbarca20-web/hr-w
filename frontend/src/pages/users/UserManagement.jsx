import {
  useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Table from '../../components/common/Table';
import Button from '../../components/common/Button';
import Modal from '../../components/common/Modal';
import Alert from '../../components/common/Alert';
import Badge from '../../components/common/Badge';
import { listUsers, createUser, deactivateUser, updateUser, permanentlyDeleteUser } from '../../api/user.api';
import { listEmployees } from '../../api/employee.api';
import { listShifts } from '../../api/shift.api';
import { listLogs } from '../../api/device.api';
import { useForm } from 'react-hook-form';
import { useAuth } from '../../context/AuthContext';
import { useTenantCompanyId } from '../../hooks/useTenantCompanyId';

function popoverCoords(triggerEl, minWidth = 192) {
  const rect = triggerEl.getBoundingClientRect();
  const gap = 6;
  const vw = window.innerWidth;
  let left = rect.right - minWidth;
  if (left < 8) left = 8;
  if (left + minWidth > vw - 8) left = Math.max(8, vw - minWidth - 8);
  return { top: rect.bottom + gap, left, minWidth };
}

function EmployeeSelect({ register, name, employees, label, hint }) {
  const { t } = useTranslation();
  return (
    <div className="col-span-2">
      <label className="label">{label}</label>
      <select className="input" {...register(name)}>
        <option value="">{t('users.no_employee', '— Not linked —')}</option>
        {employees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.employee_number} — {e.first_name} {e.last_name}
          </option>
        ))}
      </select>
      {hint && <p className="text-xs text-gray-500 mt-1">{hint}</p>}
    </div>
  );
}

function UserForm({ onDone, onCancel, companyId, employees, shifts, biometricOptions }) {
  const { t } = useTranslation();
  const { register, handleSubmit, watch, formState: { isSubmitting, errors } } = useForm();
  const autoCreateEmployee = watch('auto_create_employee');

  const onSubmit = async (values) => {
    const payload = {
      company_id: companyId,
      role_id: Number(values.role_id),
      employee_id: values.employee_id ? Number(values.employee_id) : undefined,
      email: values.email,
      password: values.password,
    };
    if (values.auto_create_employee) {
      payload.auto_employee = {
        employee_number: String(values.auto_employee_number || '').trim().toUpperCase(),
        first_name: String(values.auto_first_name || '').trim(),
        last_name: String(values.auto_last_name || '').trim(),
        hire_date: values.auto_hire_date || undefined,
        shift_id: values.auto_shift_id ? Number(values.auto_shift_id) : null,
      };
    }
    await createUser(payload);
    onDone();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">{t('auth.email')}</label>
          <input type="email" className="input" {...register('email', { required: true })} />
        </div>
        <div className="col-span-2">
          <label className="label">{t('auth.password')}</label>
          <input type="password" className="input" placeholder="Min 8 chars" {...register('password', { required: true, minLength: 8 })} />
          {errors.password && <p className="text-danger text-xs mt-1">Minimum 8 characters</p>}
        </div>
        <div className="col-span-2">
          <label className="label">{t('users.role')}</label>
          <select className="input" {...register('role_id', { required: true })}>
            <option value="">— {t('users.select_role')} —</option>
            <option value="1">ADMIN</option>
            <option value="2">HR</option>
            <option value="3">EMPLOYEE</option>
          </select>
        </div>
        <EmployeeSelect
          register={register}
          name="employee_id"
          employees={employees}
          label={t('users.link_employee', 'Link to employee (optional)')}
          hint={t('users.link_employee_hint', 'Required for self-service profile, attendance, and payroll visibility.')}
        />
        <div className="col-span-2">
          <label className="inline-flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" {...register('auto_create_employee')} />
            {t('users.auto_create_employee', 'Create employee automatically and link this account')}
          </label>
        </div>
        {autoCreateEmployee ? (
          <>
            <div className="col-span-2">
              <label className="label">{t('employee.biometric_code', 'Biometric Number')}</label>
              <input
                className="input"
                list="biometric-number-options"
                {...register('auto_employee_number', { required: true })}
                placeholder={t('employee.biometric_code_placeholder', 'From device enrollment code')}
                onInput={(e) => { e.target.value = e.target.value.toUpperCase(); }}
              />
              <datalist id="biometric-number-options">
                {biometricOptions.map((code) => <option key={code} value={code} />)}
              </datalist>
            </div>
            <div>
              <label className="label">{t('employee.name')} (First)</label>
              <input className="input" {...register('auto_first_name', { required: true })} />
            </div>
            <div>
              <label className="label">{t('employee.name')} (Last)</label>
              <input className="input" {...register('auto_last_name', { required: true })} />
            </div>
            <div>
              <label className="label">{t('employee.hire_date')}</label>
              <input type="date" className="input" {...register('auto_hire_date')} />
            </div>
            <div>
              <label className="label">{t('shift.title', 'Shift')}</label>
              <select className="input" {...register('auto_shift_id')}>
                <option value="">{t('common.none', '—')}</option>
                {shifts.map((s) => (
                  <option key={s.id} value={s.id}>{s.name || s.name_ar || `Shift #${s.id}`}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-500 mt-1">
                {t('users.auto_employee_note', 'You can adjust employee details later from Employees page.')}
              </p>
            </div>
          </>
        ) : null}
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
      </div>
    </form>
  );
}

function UserEditForm({ userRow, onDone, onCancel, companyId, employees }) {
  const { t } = useTranslation();
  const { register, handleSubmit, formState: { isSubmitting } } = useForm({
    defaultValues: {
      email: userRow.email,
      role_id: String(userRow.role_id),
      employee_id: userRow.employee_id ? String(userRow.employee_id) : '',
      is_active: userRow.is_active ? '1' : '0',
      password: '',
    },
  });

  const onSubmit = async (values) => {
    const payload = {
      company_id: companyId,
      email: values.email,
      role_id: Number(values.role_id),
      is_active: Number(values.is_active),
      employee_id: values.employee_id ? Number(values.employee_id) : null,
    };
    if (values.password && values.password.length >= 8) payload.password = values.password;
    await updateUser(userRow.id, payload);
    onDone();
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className="label">{t('auth.email')}</label>
          <input type="email" className="input" {...register('email', { required: true })} />
        </div>
        <div className="col-span-2">
          <label className="label">{t('users.new_password_optional', 'New password (optional)')}</label>
          <input
            type="password"
            className="input"
            placeholder={t('users.min_8_if_set', 'Min 8 characters if set')}
            {...register('password', { validate: (v) => !v || String(v).length >= 8 || t('users.min_8_if_set') })}
          />
        </div>
        <div className="col-span-2">
          <label className="label">{t('users.role')}</label>
          <select className="input" {...register('role_id', { required: true })}>
            <option value="1">ADMIN</option>
            <option value="2">HR</option>
            <option value="3">EMPLOYEE</option>
          </select>
        </div>
        <EmployeeSelect
          register={register}
          name="employee_id"
          employees={employees}
          label={t('users.link_employee', 'Link to employee')}
          hint={t('users.link_employee_edit_hint', 'Clear selection to unlink.')}
        />
        <div className="col-span-2">
          <label className="label">{t('employee.status')}</label>
          <select className="input" {...register('is_active')}>
            <option value="1">{t('employee.active')}</option>
            <option value="0">{t('employee.inactive')}</option>
          </select>
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="ghost" type="button" onClick={onCancel}>{t('common.cancel')}</Button>
        <Button type="submit" loading={isSubmitting}>{t('common.save')}</Button>
      </div>
    </form>
  );
}

export default function UserManagement() {
  const { t } = useTranslation();
  const { user, hasFeature } = useAuth();

  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [biometricOptions, setBiometricOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTP] = useState(1);
  const [modal, setModal] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [alert, setAlert] = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  /** null | { kind, top, left, minWidth, row? } — floating actions menu */
  const [actionsMenu, setActionsMenu] = useState(null);
  const headerSelectRef = useRef(null);
  const companyId = useTenantCompanyId(user);
  const canPickEmployee = hasFeature('employees');

  const fetchData = useCallback(async () => {
    if (!companyId) {
      setRows([]);
      setTP(1);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await listUsers({ page, limit: 10, company_id: companyId });
      setRows(data.data?.data || []);
      setTP(data.data?.meta?.totalPages || 1);
    } catch { setRows([]); }
    finally { setLoading(false); }
  }, [page, companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setRowSelection({});
    setActionsMenu(null);
  }, [page]);

  useEffect(() => {
    if (actionsMenu === null) return undefined;
    const close = (e) => {
      if (e.target.closest('[data-user-actions]')) return;
      setActionsMenu(null);
    };
    const onScroll = () => setActionsMenu(null);
    document.addEventListener('mousedown', close);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [actionsMenu]);

  const openUserRowMenu = useCallback((e, row) => {
    e.stopPropagation();
    const { top, left, minWidth } = popoverCoords(e.currentTarget, 208);
    setActionsMenu((prev) => {
      if (prev?.kind === 'row' && prev.row?.id === row.id) return null;
      return { kind: 'row', row, top, left, minWidth };
    });
  }, []);

  const openUserBulkMenu = useCallback((e) => {
    e.stopPropagation();
    const { top, left, minWidth } = popoverCoords(e.currentTarget, 220);
    setActionsMenu((prev) => {
      if (prev?.kind === 'bulk') return null;
      return { kind: 'bulk', top, left, minWidth };
    });
  }, []);

  useEffect(() => {
    if (!canPickEmployee || !companyId) {
      setEmployees([]);
      return;
    }
    listEmployees({ page: 1, limit: 500, company_id: companyId, status: 'ACTIVE' })
      .then(({ data }) => setEmployees(data.data?.data || []))
      .catch(() => setEmployees([]));
  }, [canPickEmployee, companyId, modal, editRow]);

  useEffect(() => {
    if (!modal || !companyId) return;
    listShifts({ include_inactive: false, company_id: companyId })
      .then(({ data }) => {
        const rows = data?.data?.shifts || data?.data || [];
        setShifts(Array.isArray(rows) ? rows : []);
      })
      .catch(() => setShifts([]));

    listLogs({ page: 1, limit: 200, company_id: companyId })
      .then(({ data }) => {
        const rows = data?.data?.data || data?.data?.logs || [];
        const uniq = [...new Set((Array.isArray(rows) ? rows : []).map((r) => String(r.card_number || '').trim().toUpperCase()).filter(Boolean))];
        setBiometricOptions(uniq.slice(0, 300));
      })
      .catch(() => setBiometricOptions([]));
  }, [modal, companyId]);

  const handleDeactivate = useCallback(async (id) => {
    if (!companyId) return;
    if (!window.confirm(t('users.confirm_deactivate'))) return;
    try {
      await deactivateUser(id, { company_id: companyId });
      setRowSelection((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', message: e.response?.data?.error || 'Error' });
    }
  }, [companyId, t, fetchData]);

  const handlePermanentDelete = useCallback(async (id) => {
    if (!companyId) return;
    if (!window.confirm(t('users.confirm_permanent_delete'))) return;
    try {
      await permanentlyDeleteUser(id, { company_id: companyId });
      setAlert({ type: 'success', message: t('users.permanent_delete_done', 'تم حذف المستخدم نهائياً') });
      setRowSelection((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', message: e.response?.data?.error || 'Error' });
    }
  }, [companyId, t, fetchData]);

  const toggleRowSelected = useCallback((id) => {
    setRowSelection((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const toggleSelectAllPage = useCallback(() => {
    setRowSelection((prev) => {
      const all = rows.length > 0 && rows.every((r) => prev[r.id]);
      const next = { ...prev };
      if (all) rows.forEach((r) => { delete next[r.id]; });
      else rows.forEach((r) => { next[r.id] = true; });
      return next;
    });
  }, [rows]);

  const allPageSelected = rows.length > 0 && rows.every((r) => rowSelection[r.id]);
  const somePageSelected = rows.some((r) => rowSelection[r.id]) && !allPageSelected;

  useLayoutEffect(() => {
    const el = headerSelectRef.current;
    if (el) el.indeterminate = Boolean(somePageSelected);
  }, [somePageSelected, rows.length]);

  const selectedCount = useMemo(
    () => Object.keys(rowSelection).filter((k) => rowSelection[k]).length,
    [rowSelection],
  );

  const roleName = (row) => row.role?.name || row.Role?.name || '—';
  const canPermanentDeleteUser = user?.role === 'ADMIN' || user?.is_super_admin;
  const menuBtnClass = 'w-full text-right px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 flex items-center gap-2';

  const handleBulkDeactivate = async () => {
    if (!companyId) return;
    const targets = rows.filter(
      (r) => rowSelection[r.id] && r.is_active && Number(r.id) !== Number(user?.id),
    );
    if (!targets.length) {
      setAlert({ type: 'warning', message: t('users.bulk_none_active') });
      setActionsMenu(null);
      return;
    }
    if (!window.confirm(t('users.bulk_confirm_deactivate', { count: targets.length }))) return;
    try {
      for (const r of targets) {
        await deactivateUser(r.id, { company_id: companyId });
      }
      setRowSelection({});
      setActionsMenu(null);
      setAlert({ type: 'success', message: t('common.save', 'تم') });
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', message: e.response?.data?.error || 'Error' });
    }
  };

  const handleBulkPermanentDelete = async () => {
    if (!companyId || !canPermanentDeleteUser) return;
    const targets = rows.filter(
      (r) => rowSelection[r.id]
        && Number(r.id) !== Number(user?.id),
    );
    if (!targets.length) {
      setActionsMenu(null);
      return;
    }
    if (!window.confirm(t('users.bulk_confirm_delete', { count: targets.length }))) return;
    try {
      for (const r of targets) {
        await permanentlyDeleteUser(r.id, { company_id: companyId });
      }
      setRowSelection({});
      setActionsMenu(null);
      setAlert({ type: 'success', message: t('users.permanent_delete_done') });
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', message: e.response?.data?.error || 'Error' });
    }
  };

  const COLUMNS = useMemo(() => [
    {
      key: 'select',
      label: (
        <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          <input
            ref={headerSelectRef}
            type="checkbox"
            className="rounded border-gray-300"
            checked={allPageSelected}
            onChange={toggleSelectAllPage}
            title={t('common.select_all')}
            aria-label={t('common.select_all')}
          />
        </span>
      ),
      sortable: false,
      export: false,
      render: (row) => (
        <input
          type="checkbox"
          className="rounded border-gray-300"
          checked={Boolean(rowSelection[row.id])}
          onChange={() => toggleRowSelected(row.id)}
            aria-label={t('common.select', 'Select row')}
        />
      ),
    },
    {
      key: 'email',
      label: t('users.username_email'),
      sortValue: (row) => String(row.email || '').toLowerCase(),
      sortOnCellClick: true,
    },
    {
      key: 'role', label: t('users.role'),
      render: (row) => <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">{roleName(row)}</span>,
    },
    {
      key: 'employee', label: t('users.linked_employee', 'Employee'),
      render: (row) => {
        const e = row.employee || row.Employee;
        if (!e) return <span className="text-gray-400 text-sm">—</span>;
        return (
          <span className="text-sm">
            {e.employee_number} · {e.first_name} {e.last_name}
          </span>
        );
      },
    },
    {
      key: 'is_active', label: t('employee.status'),
      render: (row) => (
        <Badge
          status={row.is_active ? 'ACTIVE' : 'INACTIVE'}
          label={row.is_active ? t('employee.active') : t('employee.inactive')}
        />
      ),
    },
    {
      key: 'last_login', label: t('users.last_login'),
      render: (row) => row.last_login ? new Date(row.last_login).toLocaleString() : '—',
    },
    {
      key: 'actions',
      label: t('common.actions_menu'),
      sortable: false,
      export: false,
      render: (row) => {
        const menuOpen = actionsMenu?.kind === 'row' && actionsMenu.row?.id === row.id;
        return (
          <div className="inline-block text-start" data-user-actions>
            <button
              type="button"
              className={`btn-ghost text-xs py-1.5 px-2.5 border border-gray-200 bg-white text-gray-800 shadow-sm ${menuOpen ? 'ring-2 ring-brand/40' : ''}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={(e) => openUserRowMenu(e, row)}
            >
              <span className="material-icons-round text-sm align-middle">expand_more</span>
              {t('common.actions_menu')}
            </button>
          </div>
        );
      },
    },
  ], [
    t, rows, rowSelection, allPageSelected, actionsMenu, user, canPermanentDeleteUser,
    menuBtnClass, toggleSelectAllPage, toggleRowSelected, openUserRowMenu,
    roleName,
  ]);

  return (
    <div className="space-y-6">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4 flex items-center justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #7b1fa2, #4a148c)' }}
        >
          <h2 className="text-white font-semibold">{t('users.title')}</h2>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCount > 0 ? (
              <div className="inline-block" data-user-actions>
                <button
                  type="button"
                  className={`btn-ghost text-xs py-2 px-3 bg-white/15 text-white border border-white/30 hover:bg-white/25 ${actionsMenu?.kind === 'bulk' ? 'ring-2 ring-white/50' : ''}`}
                  aria-expanded={actionsMenu?.kind === 'bulk'}
                  aria-haspopup="menu"
                  onClick={openUserBulkMenu}
                >
                  <span className="material-icons-round text-base align-middle">playlist_add_check</span>
                  {t('common.actions_menu')} ({selectedCount})
                </button>
              </div>
            ) : null}
            <Button icon="person_add" onClick={() => setModal(true)}>{t('users.add')}</Button>
          </div>
        </div>

        <Table
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          page={page}
          totalPages={totalPages}
          onPage={setPage}
        />
      </div>

      <Modal open={modal} onClose={() => setModal(false)} title={t('users.add')}>
        <UserForm
          companyId={companyId}
          employees={employees}
          shifts={shifts}
          biometricOptions={biometricOptions}
          onDone={() => { setModal(false); fetchData(); }}
          onCancel={() => setModal(false)}
        />
      </Modal>

      <Modal open={!!editRow} onClose={() => setEditRow(null)} title={t('users.edit_user', 'Edit user')}>
        {editRow && (
          <UserEditForm
            userRow={editRow}
            companyId={companyId}
            employees={employees}
            onDone={() => { setEditRow(null); fetchData(); }}
            onCancel={() => setEditRow(null)}
          />
        )}
      </Modal>

      {actionsMenu && createPortal(
        <div
          data-user-actions
          role="menu"
          className="fixed z-[200] rounded-lg border border-gray-100 bg-white py-1 shadow-xl text-gray-800"
          style={{
            top: actionsMenu.top,
            left: actionsMenu.left,
            minWidth: actionsMenu.minWidth,
          }}
        >
          {actionsMenu.kind === 'row' ? (
            <>
              <button
                type="button"
                className={menuBtnClass}
                onClick={() => {
                  setEditRow(actionsMenu.row);
                  setActionsMenu(null);
                }}
              >
                <span className="material-icons-round text-base text-purple-700">edit</span>
                {t('common.edit')}
              </button>
              {actionsMenu.row.is_active && Number(actionsMenu.row.id) !== Number(user?.id) ? (
                <button
                  type="button"
                  className={menuBtnClass}
                  onClick={() => {
                    setActionsMenu(null);
                    handleDeactivate(actionsMenu.row.id);
                  }}
                >
                  <span className="material-icons-round text-base text-amber-600">person_off</span>
                  {t('users.deactivate')}
                </button>
              ) : null}
              {canPermanentDeleteUser && Number(actionsMenu.row.id) !== Number(user?.id) ? (
                <button
                  type="button"
                  className={`${menuBtnClass} text-red-700`}
                  onClick={() => {
                    setActionsMenu(null);
                    handlePermanentDelete(actionsMenu.row.id);
                  }}
                >
                  <span className="material-icons-round text-base">delete_forever</span>
                  {t('users.permanent_delete')}
                </button>
              ) : null}
            </>
          ) : (
            <>
              <button
                type="button"
                className={menuBtnClass}
                onClick={() => {
                  setActionsMenu(null);
                  void handleBulkDeactivate();
                }}
              >
                <span className="material-icons-round text-base text-amber-600">person_off</span>
                {t('users.bulk_deactivate_selected')}
              </button>
              {canPermanentDeleteUser ? (
                <button
                  type="button"
                  className={`${menuBtnClass} text-red-700`}
                  onClick={() => {
                    setActionsMenu(null);
                    void handleBulkPermanentDelete();
                  }}
                >
                  <span className="material-icons-round text-base">delete_forever</span>
                  {t('users.bulk_delete_selected')}
                </button>
              ) : null}
            </>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
