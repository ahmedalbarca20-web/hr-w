'use strict';

const Company    = require('./company.model');
const CompanyFeature = require('./company_feature.model');
const Role       = require('./role.model');
const User       = require('./user.model');
const PushSubscription = require('./push_subscription.model');
const Department = require('./department.model');
const Employee   = require('./employee.model');
const Attendance = require('./attendance.model');
const AttendanceRequest = require('./attendance_request.model');
const { LeaveType, LeaveBalance, LeaveRequest } = require('./leave.model');
const {
  SalaryComponent, EmployeeSalaryComponent,
  PayrollRun, PayrollItem, PayrollItemComponent,
} = require('./payroll.model');
const Announcement      = require('./announcement.model');
const { Device, DeviceLog } = require('./device.model');
const WorkShift         = require('./work_shift.model');
const SurpriseAttendanceEvent = require('./surprise_attendance.model');

// Auth
Company.hasMany(CompanyFeature, { foreignKey: 'company_id', as: 'features' });
CompanyFeature.belongsTo(Company, { foreignKey: 'company_id', as: 'company' });

Role.hasMany(User, { foreignKey: 'role_id', as: 'users' });
User.belongsTo(Role, { foreignKey: 'role_id', as: 'role' });

User.hasMany(PushSubscription, { foreignKey: 'user_id', as: 'pushSubscriptions' });
PushSubscription.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Department tree
Department.belongsTo(Department, { foreignKey: 'parent_id', as: 'parent' });
Department.hasMany  (Department, { foreignKey: 'parent_id', as: 'children' });

// Department <-> Employee
Department.hasMany  (Employee,   { foreignKey: 'department_id', as: 'employees' });
Employee.belongsTo  (Department, { foreignKey: 'department_id', as: 'department' });
Department.belongsTo(Employee,   { foreignKey: 'manager_id',    as: 'manager' });

// Employee self-ref
Employee.belongsTo(Employee, { foreignKey: 'manager_id', as: 'directManager' });
Employee.hasMany  (Employee, { foreignKey: 'manager_id', as: 'subordinates' });

// User <-> Employee
User.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
Employee.hasOne(User,    { foreignKey: 'employee_id', as: 'user' });

// Attendance <-> Employee
Employee.hasMany  (Attendance, { foreignKey: 'employee_id', as: 'attendances' });
Attendance.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
Employee.hasMany  (AttendanceRequest, { foreignKey: 'employee_id', as: 'attendanceRequests' });
AttendanceRequest.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });
User.hasMany      (AttendanceRequest, { foreignKey: 'reviewed_by', as: 'reviewedAttendanceRequests' });
AttendanceRequest.belongsTo(User, { foreignKey: 'reviewed_by', as: 'reviewer' });

// Leave
LeaveType.hasMany    (LeaveBalance,  { foreignKey: 'leave_type_id', as: 'balances' });
LeaveBalance.belongsTo(LeaveType,   { foreignKey: 'leave_type_id', as: 'leaveType' });
Employee.hasMany     (LeaveBalance,  { foreignKey: 'employee_id',   as: 'leaveBalances' });
LeaveBalance.belongsTo(Employee,    { foreignKey: 'employee_id',   as: 'employee' });
LeaveType.hasMany    (LeaveRequest,  { foreignKey: 'leave_type_id', as: 'requests' });
LeaveRequest.belongsTo(LeaveType,   { foreignKey: 'leave_type_id', as: 'leaveType' });
Employee.hasMany     (LeaveRequest,  { foreignKey: 'employee_id',   as: 'leaveRequests' });
LeaveRequest.belongsTo(Employee,    { foreignKey: 'employee_id',   as: 'employee' });
User.hasMany         (LeaveRequest,  { foreignKey: 'approved_by',   as: 'approvedLeaveRequests' });
LeaveRequest.belongsTo(User,        { foreignKey: 'approved_by',   as: 'approver' });

// Payroll
Employee.hasMany   (EmployeeSalaryComponent, { foreignKey: 'employee_id',  as: 'salaryComponents' });
EmployeeSalaryComponent.belongsTo(Employee,  { foreignKey: 'employee_id',  as: 'employee' });
SalaryComponent.hasMany(EmployeeSalaryComponent, { foreignKey: 'component_id', as: 'employeeAssignments' });
EmployeeSalaryComponent.belongsTo(SalaryComponent, { foreignKey: 'component_id', as: 'component' });
PayrollRun.hasMany   (PayrollItem,  { foreignKey: 'payroll_run_id', as: 'items' });
PayrollItem.belongsTo(PayrollRun,  { foreignKey: 'payroll_run_id', as: 'payrollRun' });
Employee.hasMany     (PayrollItem,  { foreignKey: 'employee_id',   as: 'payrollItems' });
PayrollItem.belongsTo(Employee,    { foreignKey: 'employee_id',   as: 'employee' });
PayrollItem.hasMany  (PayrollItemComponent, { foreignKey: 'payroll_item_id', as: 'lineItems' });
PayrollItemComponent.belongsTo(PayrollItem, { foreignKey: 'payroll_item_id', as: 'payrollItem' });
SalaryComponent.hasMany(PayrollItemComponent, { foreignKey: 'component_id', as: 'payrollLineItems' });
PayrollItemComponent.belongsTo(SalaryComponent, { foreignKey: 'component_id', as: 'component' });

// Announcements
User.hasMany         (Announcement, { foreignKey: 'published_by',   as: 'announcements' });
Announcement.belongsTo(User,       { foreignKey: 'published_by',   as: 'publisher' });
Role.hasMany         (Announcement, { foreignKey: 'target_role_id', as: 'targetedAnnouncements' });
Announcement.belongsTo(Role,       { foreignKey: 'target_role_id', as: 'targetRole' });

// Device <-> Department / Employee / DeviceLog
Department.hasMany(Device, { foreignKey: 'department_id', as: 'devices' });
Device.belongsTo(Department, { foreignKey: 'department_id', as: 'department' });
Device.hasMany    (DeviceLog, { foreignKey: 'device_id',   as: 'logs' });
DeviceLog.belongsTo(Device,  { foreignKey: 'device_id',   as: 'device' });
Employee.hasMany  (DeviceLog, { foreignKey: 'employee_id', as: 'deviceLogs' });
DeviceLog.belongsTo(Employee, { foreignKey: 'employee_id', as: 'employee' });

// WorkShift <-> Employee
WorkShift.hasMany (Employee,  { foreignKey: 'shift_id', as: 'employees' });
Employee.belongsTo(WorkShift, { foreignKey: 'shift_id', as: 'shift' });

// Surprise attendance event <-> Attendance (device punch during announced window)
SurpriseAttendanceEvent.hasMany(Attendance, { foreignKey: 'surprise_event_id', as: 'attendanceRecords' });
Attendance.belongsTo(SurpriseAttendanceEvent, { foreignKey: 'surprise_event_id', as: 'surprise_event' });

module.exports = {
  Company,
  CompanyFeature,
  Role, User, Department, Employee,
  Attendance,
  AttendanceRequest,
  LeaveType, LeaveBalance, LeaveRequest,
  SalaryComponent, EmployeeSalaryComponent,
  PayrollRun, PayrollItem, PayrollItemComponent,
  Announcement,
  Device, DeviceLog,
  WorkShift,
  SurpriseAttendanceEvent,
};