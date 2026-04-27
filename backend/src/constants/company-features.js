'use strict';

const COMPANY_FEATURES = Object.freeze([
  'employees',
  'departments',
  'attendance',
  'leaves',
  'payroll',
  'reports',
  'devices',
  'users',
  'announcements',
  'shifts',
  'process',
  /** عرض PIN مستخدمي جهاز ZK في API/مركز المزامنة — يفعّل السوبر أدمن من خصائص الشركة (حساس). */
  'zk_device_pin',
]);

module.exports = {
  COMPANY_FEATURES,
};
