import { useEffect, useMemo, useState, useCallback } from 'react';
import { createDepartment, deleteDepartment, listDepartments, updateDepartment } from '../../api/department.api';
import { listEmployees } from '../../api/employee.api';
import Alert from '../../components/common/Alert';

const COLORS = ['#9c27b0', '#00bcd4', '#4caf50', '#ff9800', '#f44336', '#3f51b5'];

export default function DepartmentList() {
  const [rows, setRows] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState('');
  const [alert, setAlert] = useState(null);
  const [form, setForm] = useState({
    name: '',
    name_ar: '',
    parent_id: '',
    manager_id: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: depData }, { data: empData }] = await Promise.all([
        listDepartments({ page: 1, limit: 1000 }),
        listEmployees({ page: 1, limit: 1000, status: 'ACTIVE' }),
      ]);
      setRows(depData?.data?.data || []);
      setEmployees(empData?.data?.data || []);
    } catch (e) {
      setAlert({ type: 'danger', message: e.response?.data?.error || 'Failed to load departments' });
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((d) =>
      String(d.name || '').toLowerCase().includes(q) || String(d.name_ar || '').includes(search),
    );
  }, [rows, search]);

  const openAdd = () => {
    setEditing(null);
    setForm({ name: '', name_ar: '', parent_id: '', manager_id: '' });
    setModal(true);
  };

  const openEdit = (d) => {
    setEditing(d);
    setForm({
      name: d.name || '',
      name_ar: d.name_ar || '',
      parent_id: d.parent_id ? String(d.parent_id) : '',
      manager_id: d.manager_id ? String(d.manager_id) : '',
    });
    setModal(true);
  };

  const save = async () => {
    if (!String(form.name || '').trim()) {
      setAlert({ type: 'danger', message: 'اسم القسم مطلوب' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: String(form.name || '').trim(),
        name_ar: String(form.name_ar || '').trim(),
        parent_id: form.parent_id ? Number(form.parent_id) : null,
        manager_id: form.manager_id ? Number(form.manager_id) : null,
      };
      if (editing) await updateDepartment(editing.id, payload);
      else await createDepartment(payload);
      setModal(false);
      await load();
      setAlert({ type: 'success', message: editing ? 'تم تعديل القسم' : 'تمت إضافة القسم' });
    } catch (e) {
      setAlert({ type: 'danger', message: e.response?.data?.error || 'تعذر حفظ القسم' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (d) => {
    if (!window.confirm(`حذف القسم "${d.name}"؟`)) return;
    try {
      await deleteDepartment(d.id);
      await load();
      setAlert({ type: 'success', message: 'تم حذف القسم' });
    } catch (e) {
      setAlert({ type: 'danger', message: e.response?.data?.error || 'تعذر حذف القسم' });
    }
  };

  return (
    <div className="space-y-5">
      {alert && <Alert type={alert.type} message={alert.message} onClose={() => setAlert(null)} />}

      <div className="bg-white rounded-xl shadow-card px-5 py-4 flex items-center gap-3">
        <div className="relative flex-1">
          <span className="material-icons-round absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">search</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="بحث الأقسام..." className="input pl-9" />
        </div>
        <button onClick={openAdd} className="btn-primary gap-2">
          <span className="material-icons-round text-base">add</span>
          إضافة قسم
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {loading && (
          <div className="bg-white rounded-xl shadow-card p-8 text-center text-gray-400 col-span-full">
            <span className="material-icons-round animate-spin text-2xl">sync</span>
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <div className="bg-white rounded-xl shadow-card p-8 text-center text-gray-400 col-span-full">لا توجد أقسام</div>
        )}

        {!loading && filtered.map((d, idx) => {
          const color = COLORS[idx % COLORS.length];
          const manager = d.manager ? `${d.manager.first_name} ${d.manager.last_name}` : '—';
          const parent = d.parent?.name || '—';
          return (
            <div key={d.id} className="bg-white rounded-xl shadow-card overflow-hidden hover:shadow-card-lg transition-shadow">
              <div className="h-1.5" style={{ background: color }} />
              <div className="p-5">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${color}12` }}>
                      <span className="material-icons-round text-xl" style={{ color }}>account_tree</span>
                    </div>
                    <div>
                      <p className="font-bold text-gray-800">{d.name}</p>
                      <p className="text-xs text-gray-400">{d.name_ar || '—'}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => openEdit(d)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-50 hover:text-brand transition">
                      <span className="material-icons-round text-base">edit</span>
                    </button>
                    <button onClick={() => remove(d)} className="p-1.5 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-600 transition">
                      <span className="material-icons-round text-base">delete</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="material-icons-round text-base text-gray-400">person</span>
                    {manager}
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-600">
                    <span className="material-icons-round text-base text-gray-400">subdirectory_arrow_right</span>
                    القسم الأعلى: {parent}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-card-lg p-6 w-full max-w-md">
            <h2 className="font-bold text-gray-800 text-lg mb-5">{editing ? 'تعديل قسم' : 'إضافة قسم'}</h2>
            <div className="space-y-4">
              <div>
                <label className="label">اسم القسم *</label>
                <input className="input" value={form.name} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
              </div>
              <div>
                <label className="label">اسم القسم بالعربي</label>
                <input className="input" value={form.name_ar} onChange={(e) => setForm((p) => ({ ...p, name_ar: e.target.value }))} dir="rtl" />
              </div>
              <div>
                <label className="label">القسم الأعلى (اختياري)</label>
                <select className="input" value={form.parent_id} onChange={(e) => setForm((p) => ({ ...p, parent_id: e.target.value }))}>
                  <option value="">—</option>
                  {rows
                    .filter((r) => !editing || r.id !== editing.id)
                    .map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">المدير (اختياري)</label>
                <select className="input" value={form.manager_id} onChange={(e) => setForm((p) => ({ ...p, manager_id: e.target.value }))}>
                  <option value="">—</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.employee_number} - {e.first_name} {e.last_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(false)} className="btn-ghost flex-1">إلغاء</button>
              <button onClick={save} disabled={saving} className="btn-primary flex-1 justify-center">
                {saving ? 'جاري الحفظ...' : (editing ? 'حفظ التعديلات' : 'إضافة')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

