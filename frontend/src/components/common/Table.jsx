import { useTranslation } from 'react-i18next';
import { useMemo, useState } from 'react';
import { SkeletonRow } from './Loader';
import Pagination from './Pagination';

/** Default cell text when column has no `render` — avoids React #31 on objects. */
function cellDisplayValue(val) {
  if (val == null || val === '') return '—';
  if (typeof val === 'string' || typeof val === 'number') return val;
  if (typeof val === 'boolean') return val ? '✓' : '—';
  if (typeof val === 'object') {
    if (typeof val.name === 'string' && val.name) return val.name;
    if (typeof val.name_ar === 'string' && val.name_ar) return val.name_ar;
    if (typeof val.title === 'string' && val.title) return val.title;
    if (typeof val.email === 'string' && val.email) return val.email;
    if (typeof val.label === 'string' && val.label) return val.label;
    try {
      return JSON.stringify(val);
    } catch {
      return '—';
    }
  }
  return String(val);
}

/**
 * Generic table component.
 * @param {Array} columns  - [{ key, label, render? }]
 * @param {Array} rows     - array of data objects
 * @param {boolean} loading
 * @param {number} page
 * @param {number} totalPages
 * @param {Function} onPage
 */
export default function Table({
  columns, rows, loading,
  page = 1, totalPages = 1, onPage,
  keyField = 'id',
  exportFileName = 'table-export',
}) {
  const { t } = useTranslation();
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });
  const exportableColumns = columns.filter(
    (col) => col.key !== 'actions' && col.key !== 'select' && col.export !== false,
  );

  const normalizeExportValue = (value) => {
    if (value === null || value === undefined) return '';
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (value instanceof Date) return value.toISOString();
    if (typeof value === 'object') {
      if (value.first_name || value.last_name) return `${value.first_name || ''} ${value.last_name || ''}`.trim();
      if (value.name || value.name_ar) return value.name_ar || value.name;
      return JSON.stringify(value);
    }
    return String(value);
  };

  const normalizeSortValue = (row, col) => {
    const raw = typeof col.sortValue === 'function' ? col.sortValue(row) : row?.[col.key];
    if (raw === null || raw === undefined) return '';
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'boolean') return raw ? 1 : 0;
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'object') {
      if (raw.first_name || raw.last_name) return `${raw.first_name || ''} ${raw.last_name || ''}`.trim().toLowerCase();
      if (raw.name || raw.name_ar) return String(raw.name_ar || raw.name).toLowerCase();
      return JSON.stringify(raw).toLowerCase();
    }
    const str = String(raw).trim();
    const n = Number(str);
    if (!Number.isNaN(n) && str !== '') return n;
    const d = Date.parse(str);
    if (!Number.isNaN(d) && /^\d{4}-\d{2}-\d{2}/.test(str)) return d;
    return str.toLowerCase();
  };

  const sortedRows = useMemo(() => {
    if (!sortConfig.key) return rows;
    const col = columns.find((c) => c.key === sortConfig.key);
    if (!col) return rows;
    const factor = sortConfig.direction === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = normalizeSortValue(a, col);
      const vb = normalizeSortValue(b, col);
      if (va > vb) return 1 * factor;
      if (va < vb) return -1 * factor;
      return 0;
    });
  }, [rows, columns, sortConfig]);

  const toggleSort = (col) => {
    if (col.sortable === false || col.key === 'actions' || col.key === 'select') return;
    setSortConfig((prev) => {
      if (prev.key !== col.key) return { key: col.key, direction: 'asc' };
      return { key: col.key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
    });
  };

  const handleExportExcel = async () => {
    if (!Array.isArray(rows) || rows.length === 0) return;

    const exportRows = rows.map((row) => {
      const out = {};
      exportableColumns.forEach((col) => {
        const raw = typeof col.exportValue === 'function'
          ? col.exportValue(row)
          : row[col.key];
        out[col.label || col.key] = normalizeExportValue(raw);
      });
      return out;
    });

    const { Workbook } = await import('exceljs');
    const workbook = new Workbook();
    const worksheet = workbook.addWorksheet('Sheet1');

    worksheet.columns = exportableColumns.map((col) => ({
      header: col.label || col.key,
      key: col.label || col.key,
      width: 24,
    }));

    worksheet.addRows(exportRows);

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob(
      [buffer],
      { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
    );
    const downloadUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = `${exportFileName}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(downloadUrl);
  };

  return (
    <div className="overflow-x-auto">
      <div className="px-4 pb-2 flex items-center justify-end">
        <button
          type="button"
          onClick={handleExportExcel}
          disabled={loading || !rows?.length}
          className="btn-ghost gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          title={t('common.export_excel', 'تصدير Excel')}
        >
          <span className="material-icons-round text-base">download</span>
          {t('common.export_excel', 'تصدير Excel')}
        </button>
      </div>
      <table className="w-full table-auto">
        <thead>
          <tr className="border-b border-gray-100">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`th ${col.sortable === false || col.key === 'actions' || col.key === 'select' ? '' : 'cursor-pointer select-none'}`}
                onClick={() => toggleSort(col)}
              >
                <span className="inline-flex items-center gap-1">
                  {col.label}
                  {sortConfig.key === col.key && (
                    <span className="material-icons-round text-sm">
                      {sortConfig.direction === 'asc' ? 'north' : 'south'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {loading
            ? Array.from({ length: 5 }).map((_, i) => (
                <SkeletonRow key={i} cols={columns.length} />
              ))
            : rows.length === 0
            ? (
                <tr>
                  <td colSpan={columns.length} className="td text-center py-10 text-gray-400">
                    {t('common.no_data')}
                  </td>
                </tr>
              )
            : sortedRows.map((row) => (
                <tr key={row[keyField]} className="hover:bg-gray-50 transition-colors">
                  {columns.map((col) => {
                    const cellSort =
                      col.sortOnCellClick && col.key !== 'actions' && col.key !== 'select' && col.sortable !== false
                        ? () => toggleSort(col)
                        : undefined;
                    return (
                      <td
                        key={col.key}
                        className={`td ${cellSort ? 'cursor-pointer select-none' : ''}`}
                        onClick={cellSort}
                        title={cellSort ? t('common.click_to_sort', 'انقر للترتيب') : undefined}
                      >
                        {col.render ? col.render(row) : cellDisplayValue(row[col.key])}
                      </td>
                    );
                  })}
                </tr>
              ))
          }
        </tbody>
      </table>
      {!loading && <Pagination page={page} totalPages={totalPages} onPage={onPage} />}
    </div>
  );
}

