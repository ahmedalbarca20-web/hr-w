import { createContext, useContext, useState, useEffect } from 'react';

const SidebarCtx = createContext({
  open: false,
  isDesktop: true,
  toggle: () => {},
  close: () => {},
});

export function SidebarProvider({ children }) {
  const [open, setOpen]           = useState(false);
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' ? window.innerWidth >= 1024 : true
  );

  useEffect(() => {
    const handler = () => {
      const desktop = window.innerWidth >= 1024;
      setIsDesktop(desktop);
      if (desktop) setOpen(false); // auto-close overlay when resized to desktop
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  return (
    <SidebarCtx.Provider value={{
      open,
      isDesktop,
      toggle: () => setOpen((p) => !p),
      close : () => setOpen(false),
    }}>
      {children}
    </SidebarCtx.Provider>
  );
}

export const useSidebar = () => useContext(SidebarCtx);
