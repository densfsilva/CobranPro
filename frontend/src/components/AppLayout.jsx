import { Link, useLocation, useNavigate } from "react-router-dom";
import { LayoutDashboard, Palette, LogOut, Wallet } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/branding", label: "Branding", icon: Palette },
];

export default function AppLayout({ children }) {
  const { company, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const initials = company.company_name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="w-16 lg:w-60 shrink-0 border-r border-border flex flex-col sticky top-0 h-screen">
        <div className="p-4 flex items-center gap-3 border-b border-border min-h-[72px]">
          {company.logo_base64 ? (
            <img src={company.logo_base64} alt={company.company_name} className="w-10 h-10 rounded-lg object-contain bg-white/5 shrink-0" data-testid="company-logo-img" />
          ) : (
            <div className="w-10 h-10 rounded-lg bg-brand flex items-center justify-center font-heading font-bold text-white shrink-0" data-testid="company-logo-img">
              {initials}
            </div>
          )}
          <div className="hidden lg:block min-w-0">
            <p className="font-heading font-semibold text-sm truncate" data-testid="sidebar-company-name">{company.company_name}</p>
            <p className="text-xs text-muted-foreground">Gestão de Cobranças</p>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ to, label, icon: Icon }) => {
            const active = location.pathname === to;
            return (
              <Link
                key={to}
                to={to}
                data-testid={`nav-${label.toLowerCase()}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                  active ? "bg-brand-soft text-brand" : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                }`}
              >
                <Icon size={18} className="shrink-0" />
                <span className="hidden lg:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-3 border-t border-border">
          <button
            onClick={() => { logout(); navigate("/login"); }}
            data-testid="logout-btn"
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-rose-400 hover:bg-rose-500/10 transition-colors duration-200"
          >
            <LogOut size={18} className="shrink-0" />
            <span className="hidden lg:inline">Sair</span>
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <header className="h-[72px] border-b border-border flex items-center justify-between px-4 sm:px-6 lg:px-8 sticky top-0 bg-background/80 backdrop-blur-xl z-10">
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Wallet size={16} className="text-brand" />
            <span className="hidden sm:inline">CobranPro</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-muted-foreground">{company.email}</span>
            <span className="w-3 h-3 rounded-full bg-brand ring-2 ring-brand/30" data-testid="brand-color-dot" title={company.primary_color} />
          </div>
        </header>
        <div className="p-4 sm:p-6 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
