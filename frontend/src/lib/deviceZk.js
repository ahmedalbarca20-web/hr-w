/**
 * Normalizes axios responses from POST /devices/probe-zk-socket and POST /devices/:id/zk-socket-read.
 */

export function unwrapZkPayload(res) {
  const body = res?.data;
  return body?.data ?? body;
}

/** Fills serial + firmware from a successful ZK snapshot. */
export function applyZkSnapshotToForm(setForm, z) {
  if (!z?.ok) return false;
  const sn = z.serial_number;
  if (sn == null || String(sn).trim() === '') return false;
  setForm((p) => ({
    ...p,
    serial_number: String(sn).trim(),
    firmware_version:
      z.firmware_version != null && String(z.firmware_version).trim() !== ''
        ? String(z.firmware_version)
        : p.firmware_version,
  }));
  return true;
}

export function zkFailureMessage(z) {
  if (!z) return 'تعذّر الاتصال بالجهاز';
  if (z.hint_ar) return z.hint_ar;
  const parts = (z.errors || []).map((e) => e.message).filter(Boolean);
  if (parts.length) return parts.join(' — ');
  return 'تعذّر الاتصال ببروتوكول ZK';
}

/** One-line Arabic summary for dashboards / lists. */
export function zkLiveSummaryLine(z) {
  if (!z?.ok) return zkFailureMessage(z);
  const u = z.user_count_on_device != null ? z.user_count_on_device : z.info?.userCounts;
  const lg = z.attendance_size != null ? z.attendance_size : z.info?.logCounts;
  const sn = z.serial_number ?? '—';
  const fw = z.firmware_version ?? '—';
  return `من الجهاز (ZK): تسلسل ${sn} — إصدار ${fw} — مستخدمون ${u ?? '؟'} — سجلات حضور على الجهاز ${lg ?? '؟'}`;
}

/** بايت الصلاحية في ZK: P2P1P0 = (raw >> 1) & 7 — 3=مدير، 7=مدير أعلى، 1=مسجّل (ليس الرقم 6/14 كمعنى منفصل). */
export function zkPermissionP2P1P0(roleByte) {
  const raw = Number(roleByte);
  if (!Number.isFinite(raw)) return 0;
  return (Math.trunc(raw) >> 1) & 7;
}

export function zkIsDeviceAdminPrivilege(roleByte) {
  const lv = zkPermissionP2P1P0(roleByte);
  return lv === 3 || lv === 7;
}

/** شارة عربية + ألوان لصف مستخدم الجهاز */
export function zkPrivilegeUi(u) {
  const raw = u?.role != null && Number.isFinite(Number(u.role)) ? Number(u.role) & 0xff : 0;
  const level = u?.zk_permission_level != null && Number.isFinite(Number(u.zk_permission_level))
    ? Number(u.zk_permission_level) & 7
    : zkPermissionP2P1P0(raw);
  const disabled = u?.zk_user_disabled === true || (raw & 1) === 1;

  if (level === 7) return { text: disabled ? 'مدير أعلى (معطّل)' : 'مدير أعلى', cls: 'bg-violet-100 text-violet-800', level, raw };
  if (level === 3) return { text: disabled ? 'مدير جهاز (معطّل)' : 'مدير جهاز', cls: 'bg-violet-50 text-violet-900', level, raw };
  if (level === 1) return { text: disabled ? 'مسجّل (معطّل)' : 'مسجّل', cls: 'bg-teal-100 text-teal-800', level, raw };
  if (disabled) return { text: 'معطّل', cls: 'bg-gray-200 text-gray-700', level, raw };
  return { text: 'عادي', cls: 'bg-gray-100 text-gray-600', level, raw };
}
