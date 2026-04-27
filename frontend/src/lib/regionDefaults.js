/** Defaults and pick-lists for company region (Iraq-first). */

export const DEFAULT_COMPANY_CURRENCY = 'IQD';
export const DEFAULT_COMPANY_TIMEZONE = 'Asia/Baghdad';

/** IANA zones commonly used with this product — Iraq first. */
export const COMPANY_TIMEZONE_OPTIONS = [
  { value: 'Asia/Baghdad', label: 'العراق — Asia/Baghdad (UTC+3)' },
  { value: 'Asia/Riyadh', label: 'السعودية — Asia/Riyadh' },
  { value: 'Asia/Kuwait', label: 'الكويت — Asia/Kuwait' },
  { value: 'Asia/Dubai', label: 'الإمارات — Asia/Dubai' },
  { value: 'Asia/Qatar', label: 'قطر — Asia/Qatar' },
  { value: 'Asia/Amman', label: 'الأردن — Asia/Amman' },
  { value: 'Asia/Beirut', label: 'لبنان — Asia/Beirut' },
  { value: 'Asia/Bahrain', label: 'البحرين — Asia/Bahrain' },
  { value: 'UTC', label: 'UTC' },
];

export const COMPANY_CURRENCY_OPTIONS = [
  { value: 'IQD', label: 'دينار عراقي (IQD)' },
  { value: 'USD', label: 'دولار أمريكي (USD)' },
  { value: 'SAR', label: 'ريال سعودي (SAR)' },
];
