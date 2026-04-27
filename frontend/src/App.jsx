import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { LangProvider } from './context/LangContext';
import { ThemeProvider } from './context/ThemeContext';
import { StoreProvider } from './store/index';
import { CurrencyProvider } from './context/CurrencyContext';
import AppRoutes from './router/index';

export default function App() {
  return (
    <BrowserRouter
      future={{
        v7_startTransition: true,
        v7_relativeSplatPath: true,
      }}
    >
      <ThemeProvider>
        <LangProvider>
          <AuthProvider>
            <CurrencyProvider>
              <StoreProvider>
                <AppRoutes />
              </StoreProvider>
            </CurrencyProvider>
          </AuthProvider>
        </LangProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

