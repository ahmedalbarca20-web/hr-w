import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import PrivateRoute from './PrivateRoute';
import RoleRoute from './RoleRoute';
import FeatureRoute from './FeatureRoute';
import PrivateLayout from '../components/layout/PrivateLayout';
import { PageLoader } from '../components/common/Loader';

const Login            = lazy(() => import('../pages/auth/Login'));
const EmployeeLogin    = lazy(() => import('../pages/auth/EmployeeLogin'));
const Dashboard        = lazy(() => import('../pages/dashboard/Dashboard'));
const EmployeeList     = lazy(() => import('../pages/employees/EmployeeList'));
const AttendanceList   = lazy(() => import('../pages/attendance/AttendanceList'));
const LeaveList        = lazy(() => import('../pages/leaves/LeaveList'));
const LeaveApproval    = lazy(() => import('../pages/leaves/LeaveApproval'));
const LeaveTypes       = lazy(() => import('../pages/leaves/LeaveTypes'));
const PayrollList      = lazy(() => import('../pages/payroll/PayrollList'));
const DepartmentList   = lazy(() => import('../pages/departments/DepartmentList'));
const Settings         = lazy(() => import('../pages/settings/Settings'));
const CompanyList      = lazy(() => import('../pages/companies/CompanyList'));

// Device Management (Admin/HR)
const DevicesOverview  = lazy(() => import('../pages/devices/DevicesOverview'));
const DeviceList       = lazy(() => import('../pages/devices/DeviceList'));
const DeviceForm       = lazy(() => import('../pages/devices/DeviceForm'));
const RawLogs          = lazy(() => import('../pages/devices/RawLogs'));
const SyncCenter       = lazy(() => import('../pages/devices/SyncCenter'));

// Additional pages (Admin/HR)
const AnnouncementList = lazy(() => import('../pages/announcements/AnnouncementList'));
const UserManagement   = lazy(() => import('../pages/users/UserManagement'));
const ShiftList        = lazy(() => import('../pages/shifts/ShiftList'));
const ProcessCenter    = lazy(() => import('../pages/process/ProcessCenter'));

// Employee Self-Service
const EmployeeProfile  = lazy(() => import('../pages/employees/EmployeeProfile'));

function Private({ children }) {
  return (
    <PrivateRoute>
      <PrivateLayout>{children}</PrivateLayout>
    </PrivateRoute>
  );
}

export default function AppRoutes() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        {/* ── Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/employee-login" element={<EmployeeLogin />} />

        {/* ── All Authenticated Users */}
        <Route path="/" element={<Private><Dashboard /></Private>} />
        <Route path="/employees/profile" element={<Private><EmployeeProfile /></Private>} />
        <Route path="/settings" element={<Private><Settings /></Private>} />

        {/* ── All Authenticated: Attendance & Leave (Employee Self-Service) */}
        <Route path="/attendance/*" element={
          <Private>
            <FeatureRoute feature="attendance">
              <AttendanceList />
            </FeatureRoute>
          </Private>
        } />
        <Route path="/leaves/*" element={
          <Private>
            <FeatureRoute feature="leaves">
              <LeaveList />
            </FeatureRoute>
          </Private>
        } />
        <Route path="/leaves/approval" element={
          <Private>
            <FeatureRoute feature="leaves">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <LeaveApproval />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/leaves/types" element={
          <Private>
            <FeatureRoute feature="leaves">
              <RoleRoute roles={['ADMIN']}>
                <LeaveTypes />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />

        {/* ── Admin/HR Only: Employee Management */}
        <Route path="/employees/*" element={
          <Private>
            <FeatureRoute feature="employees">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <EmployeeList />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/users" element={
          <Private>
            <FeatureRoute feature="users">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <UserManagement />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />

        {/* ── Admin/HR Only: Organization & Processing */}
        <Route path="/departments" element={
          <Private>
            <FeatureRoute feature="departments">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <DepartmentList />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/shifts" element={
          <Private>
            <FeatureRoute feature="shifts">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <ShiftList />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/process" element={
          <Private>
            <FeatureRoute feature="process">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <ProcessCenter />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />

        {/* ── Admin/HR Only: Payroll */}
        <Route path="/payroll/*" element={
          <Private>
            <FeatureRoute feature="payroll">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <PayrollList />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        {/* ── Admin/HR Only: Devices & Hardware */}
        <Route path="/devices" element={
          <Private>
            <FeatureRoute feature="devices">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <DevicesOverview />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/devices/list" element={
          <Private>
            <FeatureRoute feature="devices">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <DeviceList />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/devices/add" element={
          <Private>
            <FeatureRoute feature="devices">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <DeviceForm />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/devices/edit/:id" element={
          <Private>
            <FeatureRoute feature="devices">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <DeviceForm />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/devices/logs" element={
          <Private>
            <FeatureRoute feature="devices">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <RawLogs />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />
        <Route path="/devices/sync" element={
          <Private>
            <FeatureRoute feature="devices">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <SyncCenter />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />

        {/* ── Admin/HR Only: Communications */}
        <Route path="/announcements" element={
          <Private>
            <FeatureRoute feature="announcements">
              <RoleRoute roles={['ADMIN', 'HR']}>
                <AnnouncementList />
              </RoleRoute>
            </FeatureRoute>
          </Private>
        } />

        {/* ── Super Admin Only: Multi-Company Management */}
        <Route path="/companies" element={
          <Private>
            <RoleRoute roles={['SUPER_ADMIN']}>
              <CompanyList />
            </RoleRoute>
          </Private>
        } />

        {/* ── Fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

