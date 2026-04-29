import {
  useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import Table from '../../components/common/Table';
import Badge from '../../components/common/Badge';
import Button from '../../components/common/Button';
import SearchBar from '../../components/common/SearchBar';
import Modal from '../../components/common/Modal';
import Alert from '../../components/common/Alert';
import EmployeeForm from '../../components/forms/EmployeeForm';
import { listEmployees, deleteEmployee } from '../../api/employee.api';
import { useAuth } from '../../context/AuthContext';
import { useTenantCompanyId } from '../../hooks/useTenantCompanyId';
import { isSuperAdminUser } from '../../utils/tenantScope';

/** `position:fixed` anchor — escapes `overflow-x-auto` on tables */
function popoverCoords(triggerEl, minWidth = 176) {
  const rect = triggerEl.getBoundingClientRect();
  const gap = 6;
  const vw = window.innerWidth;
  let left = rect.right - minWidth;
  if (left < 8) left = 8;
  if (left + minWidth > vw - 8) left = Math.max(8, vw - minWidth - 8);
  return { top: rect.bottom + gap, left, minWidth };
}

export default function EmployeeList() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const companyId = useTenantCompanyId(user);
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [page, setPage]         = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [modal, setModal]       = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [alert, setAlert]       = useState(null);
  const [rowSelection, setRowSelection] = useState({});
  const [actionsMenu, setActionsMenu] = useState(null);
  const headerSelectRef = useRef(null);

  const fetchData = useCallback(async () => {
    if (!companyId) {
      setRows([]);
      setTotalPages(1);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data } = await listEmployees({ page, limit: 10, search, company_id: companyId });
      setRows(data.data?.data || []);
      setTotalPages(data.data?.meta?.totalPages || 1);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [page, search, companyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    setRowSelection({});
    setActionsMenu(null);
  }, [page]);

  useEffect(() => {
    if (actionsMenu === null) return undefined;
    const close = (e) => {
      if (e.target.closest('[data-employee-actions]')) return;
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

  const openRowActions = useCallback((e, row) => {
    e.stopPropagation();
    const { top, left, minWidth } = popoverCoords(e.currentTarget, 176);
    setActionsMenu((prev) => {
      if (prev?.kind === 'row' && prev.row?.id === row.id) return null;
      return { kind: 'row', row, top, left, minWidth };
    });
  }, []);

  const openBulkActions = useCallback((e) => {
    e.stopPropagation();
    const { top, left, minWidth } = popoverCoords(e.currentTarget, 200);
    setActionsMenu((prev) => {
      if (prev?.kind === 'bulk') return null;
      return { kind: 'bulk', top, left, minWidth };
    });
  }, []);

  const handleDelete = useCallback(async (id) => {
    if (!companyId) return;
    if (!window.confirm(t('common.confirm_delete'))) return;
    try {
      await deleteEmployee(id, { company_id: companyId });
      setAlert({ type: 'success', msg: t('employee.deleted', 'تم الحذف') });
      setRowSelection((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.message || 'Error' });
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

  const menuBtnClass = 'w-full text-right px-3 py-2 text-sm text-gray-800 hover:bg-gray-50 flex items-center gap-2';

  const handleBulkDelete = async () => {
    if (!companyId) return;
    const targets = rows.filter((r) => rowSelection[r.id]);
    if (!targets.length) {
      setActionsMenu(null);
      return;
    }
    if (!window.confirm(t('employee.bulk_confirm_delete', { count: targets.length }))) return;
    try {
      for (const r of targets) {
        await deleteEmployee(r.id, { company_id: companyId });
      }
      setRowSelection({});
      setActionsMenu(null);
      setAlert({ type: 'success', msg: t('employee.bulk_deleted', 'تم حذف الموظفين المحددين') });
      fetchData();
    } catch (e) {
      setAlert({ type: 'danger', msg: e.response?.data?.message || 'Error' });
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
      key: 'name',
      label: t('employee.name'),
      sortValue: (row) =>
        `${row.last_name || ''} ${row.first_name || ''} ${row.email || ''}`.trim().toLowerCase(),
      sortOnCellClick: true,
      render: (row) => (
        <div className="flex items-center gap-3">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center
                       text-white text-xs font-bold flex-shrink-0"
            style={{ background: 'linear-gradient(195deg, #ec407a, #d81b60)' }}
          >
            {row.first_name?.[0]}{row.last_name?.[0]}
          </div>
          <div>
            <p className="font-medium text-gray-800 text-sm">
              {row.first_name} {row.last_name}
            </p>
            <p className="text-xs text-gray-400">{row.email}</p>
          </div>
        </div>
      ),
    },
    { key: 'employee_number', label: t('employee.biometric_code') },
    {
      key: 'department', label: t('employee.department'),
      render: (row) => row.department?.name || row.Department?.name || '—',
    },
    {
      key: 'shift', label: t('shift.title', 'Shift'),
      render: (row) => row.shift?.name || row.shift?.name_ar || '—',
    },
    { key: 'position', label: t('employee.position') },
    { key: 'hire_date', label: t('employee.hire_date') },
    {
      key: 'status', label: t('employee.status'),
      render: (row) => <Badge status={row.status} label={t(`employee.${row.status?.toLowerCase()}`)} />,
    },
    {
      key: 'actions',
      label: t('common.actions_menu'),
      sortable: false,
      export: false,
      render: (row) => {
        const menuOpen = actionsMenu?.kind === 'row' && actionsMenu.row?.id === row.id;
        return (
          <div className="inline-block text-start" data-employee-actions>
            <button
              type="button"
              className={`btn-ghost text-xs py-1.5 px-2.5 border border-gray-200 bg-white text-gray-800 shadow-sm ${menuOpen ? 'ring-2 ring-brand/40' : ''}`}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={(e) => openRowActions(e, row)}
            >
              <span className="material-icons-round text-sm align-middle">expand_more</span>
              {t('common.actions_menu')}
            </button>
          </div>
        );
      },
    },
  ], [
    t, rows, rowSelection, allPageSelected, actionsMenu, menuBtnClass,
    toggleSelectAllPage, toggleRowSelected, openRowActions,
  ]);

  return (
    <div className="space-y-6">
      {alert && (
        <Alert type={alert.type} message={alert.msg} onClose={() => setAlert(null)} />
      )}

      {!loading && isSuperAdminUser(user) && companyId == null && (
        <Alert
          type="warning"
          message={t(
            'employee.super_admin_no_company',
            'لا توجد شركة نشطة في النظام. أنشئ شركة من «الشركات» ثم أعد تحميل الصفحة.',
          )}
        />
      )}

      <div className="md-card" style={{ overflow: 'visible' }}>
        <div
          className="rounded-xl mx-4 -mt-4 p-4 shadow-card-lg mb-4
                     flex flex-wrap items-center justify-between gap-3"
          style={{ background: 'linear-gradient(195deg, #42424a, #191919)' }}
        >
          <div>
            <h2 className="text-white font-semibold">{t('employee.title')}</h2>
            <p className="text-white/60 text-xs">{rows.length} {t('employee.title')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selectedCount > 0 ? (
              <div className="inline-block" data-employee-actions>
                <button
                  type="button"
                  className={`btn-ghost text-xs py-2 px-3 bg-white/15 text-white border border-white/30 hover:bg-white/25 ${actionsMenu?.kind === 'bulk' ? 'ring-2 ring-white/50' : ''}`}
                  aria-expanded={actionsMenu?.kind === 'bulk'}
                  aria-haspopup="menu"
                  onClick={openBulkActions}
                >
                  <span className="material-icons-round text-base align-middle">playlist_add_check</span>
                  {t('common.actions_menu')} ({selectedCount})
                </button>
              </div>
            ) : null}
            <Button
              icon="person_add"
              onClick={() => { setEditTarget(null); setModal(true); }}
            >
              {t('employee.add')}
            </Button>
          </div>
        </div>

        <div className="px-4 pb-3">
          <SearchBar
            value={search}
            onChange={(v) => { setSearch(v); setPage(1); }}
            placeholder={t('employee.search')}
            className="max-w-xs"
          />
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

      <Modal
        open={modal}
        onClose={() => { setModal(false); setEditTarget(null); }}
        title={editTarget ? t('employee.edit') : t('employee.add')}
        size="lg"
      >
        <EmployeeForm
          initial={editTarget}
          onDone={() => { setModal(false); setEditTarget(null); fetchData(); }}
          onCancel={() => { setModal(false); setEditTarget(null); }}
        />
      </Modal>

      {actionsMenu && createPortal(
        <div
          data-employee-actions
          role="menu"
          className="fixed z-[200] rounded-lg border border-gray-100 bg-white py-1 shadow-xl"
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
                  setEditTarget(actionsMenu.row);
                  setModal(true);
                  setActionsMenu(null);
                }}
              >
                <span className="material-icons-round text-base text-purple-700">edit</span>
                {t('common.edit')}
              </button>
              <button
                type="button"
                className={`${menuBtnClass} text-red-700`}
                onClick={() => {
                  setActionsMenu(null);
                  handleDelete(actionsMenu.row.id);
                }}
              >
                <span className="material-icons-round text-base">delete_outline</span>
                {t('common.delete')}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={`${menuBtnClass} text-red-700`}
              onClick={() => {
                setActionsMenu(null);
                void handleBulkDelete();
              }}
            >
              <span className="material-icons-round text-base">delete_outline</span>
              {t('employee.bulk_delete_selected')}
            </button>
          )}
        </div>,
        document.body,
      )}
    </div>
  );
}
