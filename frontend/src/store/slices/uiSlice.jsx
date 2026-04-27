import { createContext, useContext, useState, useCallback } from 'react';

const UIContext = createContext(null);

let _toast_id = 0;

export function UIProvider({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [toasts, setToasts]           = useState([]);

  const toast = useCallback(({ type = 'success', message, duration = 4000 }) => {
    const id = ++_toast_id;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), duration);
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <UIContext.Provider value={{ sidebarOpen, setSidebarOpen, toasts, toast, removeToast }}>
      {children}
    </UIContext.Provider>
  );
}

export const useUI = () => useContext(UIContext);
export default UIContext;

