import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import AuthPage from "@/pages/AuthPage";
import Dashboard from "@/pages/Dashboard";
import ChargeDetail from "@/pages/ChargeDetail";
import BrandingSettings from "@/pages/BrandingSettings";
import AppLayout from "@/components/AppLayout";

function Protected({ children }) {
  const { company, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-2 border-brand border-t-transparent animate-spin" data-testid="loading-spinner" />
      </div>
    );
  }
  if (!company) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="/" element={<Protected><Dashboard /></Protected>} />
          <Route path="/cobranca/:id" element={<Protected><ChargeDetail /></Protected>} />
          <Route path="/branding" element={<Protected><BrandingSettings /></Protected>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster position="top-right" richColors />
    </AuthProvider>
  );
}

export default App;
