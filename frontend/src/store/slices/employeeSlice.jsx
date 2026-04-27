import { createContext, useContext, useState, useCallback } from 'react';
import * as empApi from '../../api/employee.api';

const EmployeeCtx = createContext(null);

export function EmployeeProvider({ children }) {
  const [list, setList]       = useState([]);
  const [loading, setLoading] = useState(false);
  const [meta, setMeta]       = useState({ total_pages: 1, total: 0 });

  const fetchList = useCallback(async (params = {}) => {
    setLoading(true);
    try {
      const { data } = await empApi.listEmployees(params);
      setList(data.data?.employees || []);
      setMeta(data.data?.meta     || {});
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <EmployeeCtx.Provider value={{ list, loading, meta, fetchList }}>
      {children}
    </EmployeeCtx.Provider>
  );
}

export const useEmployeeStore = () => useContext(EmployeeCtx);
export default EmployeeCtx;

