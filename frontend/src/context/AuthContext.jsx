import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { setCountry } from "@/lib/format";

const AuthContext = createContext(null);

export function applyBrandColor(hex) {
  document.documentElement.style.setProperty("--brand", hex || "#2563EB");
}

export function AuthProvider({ children }) {
  const [company, setCompany] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("cobranpro_token");
    if (!token) {
      setLoading(false);
      return;
    }
    api.get("/auth/me")
      .then(({ data }) => {
        const { user: u, ...comp } = data;
        setCompany(comp);
        setUser(u || null);
        applyBrandColor(data.primary_color);
        setCountry(data.country);
      })
      .catch(() => localStorage.removeItem("cobranpro_token"))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((token, companyData, userData) => {
    localStorage.setItem("cobranpro_token", token);
    setCompany(companyData);
    setUser(userData || null);
    applyBrandColor(companyData.primary_color);
    setCountry(companyData.country);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("cobranpro_token");
    setCompany(null);
    setUser(null);
    applyBrandColor("#2563EB");
    setCountry("PT");
  }, []);

  const updateCompany = useCallback((data) => {
    setCompany(data);
    applyBrandColor(data.primary_color);
    setCountry(data.country);
  }, []);

  const updateUser = useCallback((u) => setUser(u), []);

  return (
    <AuthContext.Provider value={{ company, user, loading, isAdmin: user?.role === "admin", login, logout, updateCompany, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
