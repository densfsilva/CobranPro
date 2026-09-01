import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";

const AuthContext = createContext(null);

export function applyBrandColor(hex) {
  document.documentElement.style.setProperty("--brand", hex || "#2563EB");
}

export function AuthProvider({ children }) {
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("cobranpro_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api.get("/auth/me")
      .then(({ data }) => {
        setCompany(data);
        applyBrandColor(data.primary_color);
      })
      .catch(() => localStorage.removeItem("cobranpro_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((token, companyData) => {
    localStorage.setItem("cobranpro_token", token);
    setCompany(companyData);
    applyBrandColor(companyData.primary_color);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("cobranpro_token");
    setCompany(null);
    applyBrandColor("#2563EB");
  }, []);

  const updateCompany = useCallback((data) => {
    setCompany(data);
    applyBrandColor(data.primary_color);
  }, []);

  return (
    <AuthContext.Provider value={{ company, loading, login, logout, updateCompany }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
