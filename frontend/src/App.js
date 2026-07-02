// App.js
import React, { useContext } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthContext } from './context/AuthContext';
import { usePushNotifications } from './hooks/usePushNotifications';
import './styles/globals.css';

// Pages
import Home from './pages/Home';
import Eligibility from './pages/Eligibility';
import Loan from './pages/Loan';
import LoanProcessing from './pages/LoanProcessing';
import Processing from './pages/Processing';
import ProtectedRoute from './components/ProtectedRoute';

function PushSubscriber() {
  const { user } = useContext(AuthContext);
  const {
    supported,
    supportReason,
    permission,
    isSubscribed,
    message,
    requestPermissionAndSubscribe,
  } = usePushNotifications(!!user);

  if (isSubscribed) return null;

  const canEnable = supported && permission !== 'denied';
  const showBanner = permission !== 'granted' || !supported;

  if (!showBanner) return null;

  return (
    <div className="push-permission-banner" role="status" aria-live="polite">
      <div>
        <strong>Notifications</strong>
        <p>{supported ? message : supportReason}</p>
      </div>
      {canEnable && (
        <button
          type="button"
          className="push-enable-btn"
          onClick={() => {
            requestPermissionAndSubscribe().catch((err) => {
              console.warn('Push enable error:', err.message);
            });
          }}
        >
          Enable Notifications
        </button>
      )}
    </div>
  );
}

function AppRoutes() {
  return (
    <>
      <PushSubscriber />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/eligibility" element={<Eligibility />} />

        <Route
          path="/processing"
          element={
            <ProtectedRoute>
              <Processing />
            </ProtectedRoute>
          }
        />

        <Route
          path="/loanapproval"
          element={
            <ProtectedRoute>
              <Processing />
            </ProtectedRoute>
          }
        />

        <Route
          path="/loan"
          element={
            <ProtectedRoute>
              <Loan />
            </ProtectedRoute>
          }
        />

        <Route
          path="/apply"
          element={
            <ProtectedRoute>
              <Loan />
            </ProtectedRoute>
          }
        />

        <Route
          path="/loan-processing"
          element={
            <ProtectedRoute>
              <LoanProcessing />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
