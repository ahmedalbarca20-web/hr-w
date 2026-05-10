import { getResolvedApiBaseUrl } from '../api/axios';

/**
 * Hostnames that imply same-LAN / dev: use browser → http://127.0.0.1:8099 directly.
 * Public hosts (e.g. Vercel): use API relay — employee sets nothing in .env.
 */
export function isPrivateOrLocalHost(hostname) {
	const h = String(hostname || '').toLowerCase();
	if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
	const m = /^(\d+)\.(\d+)\.\d+\.\d+$/.exec(h);
	if (!m) return false;
	const a = Number(m[1]);
	const b = Number(m[2]);
	if (a === 10) return true;
	if (a === 192 && b === 168) return true;
	if (a === 172 && b >= 16 && b <= 31) return true;
	return false;
}

/**
 * true → POST /devices/local-agent/execute (JWT + server adds agent tunnel).
 * false → fetch http://127.0.0.1:8099/execute from the user's PC.
 */
export function shouldRelayLocalAgentToApi() {
	const v = String(import.meta.env.VITE_LOCAL_AGENT_RELAY || '').trim().toLowerCase();
	if (v === '0' || v === 'false' || v === 'never' || v === 'direct') return false;
	if (v === '1' || v === 'true' || v === 'always' || v === 'relay') return true;
	if (typeof window === 'undefined') return false;
	try {
		const base = getResolvedApiBaseUrl();
		const url = new URL(base, window.location.origin);
		return !isPrivateOrLocalHost(url.hostname);
	} catch {
		return false;
	}
}

/** Short Arabic hint when relay is not configured (for employees). */
export function friendlyLocalAgentRelayError(status, payload) {
	const err = String(payload?.error || payload?.message || '');
	const code = String(payload?.code || '');
	if (status === 503 && (code === 'AGENT_RELAY_NOT_CONFIGURED' || code === 'LOCAL_AGENT_NOT_CONFIGURED' || /AGENT_RELAY|LOCAL_AGENT_URL/i.test(err))) {
		return 'تعذّر الوصول لجهاز البصمة عبر شبكتك. تأكد أن برنامج المكتب على جهاز ويندوز يعمل وأن مسؤول النظام أكمل إعداد الاتصال.';
	}
	if (status === 401 || status === 403) {
		return 'انتهت الجلسة أو لا تملك صلاحية. سجّل الدخول من جديد.';
	}
	if (status === 502 || status === 504) {
		return 'لم يتم الوصول لجهاز البصمة عبر الشبكة. تحقق من الاتصال وحاول مرة أخرى، أو راجع مسؤول النظام.';
	}
	if (err && err.length < 300) return err;
	return 'تعذّر تنفيذ العملية عبر وكيل الشبكة. جرّب لاحقاً أو اتصل بمسؤول النظام.';
}
