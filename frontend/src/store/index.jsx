export { UIProvider, useUI }       from './slices/uiSlice';
export { EmployeeProvider, useEmployeeStore } from './slices/employeeSlice';
export { useAuth }                 from './slices/authSlice';

import { UIProvider }       from './slices/uiSlice';
import { EmployeeProvider } from './slices/employeeSlice';

export function StoreProvider({ children }) {
  return (
    <UIProvider>
      <EmployeeProvider>
        {children}
      </EmployeeProvider>
    </UIProvider>
  );
}

