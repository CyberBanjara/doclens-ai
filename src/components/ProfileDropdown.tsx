import { useState, useRef, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { LogOut, ShieldAlert, Loader2, ChevronDown, Heart } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { UserAvatar } from "@/components/UserAvatar";

export function ProfileDropdown() {
  const { user, loading, isAdmin, signInWithGoogle, signOut } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (loading) {
    return (
      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted/40 animate-pulse">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <button
        onClick={() => signInWithGoogle()}
        className="inline-flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary shadow-sm backdrop-blur-sm transition-all hover:bg-primary/20 hover:border-primary/40 active:scale-95"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24">
          <path
            fill="#4285F4"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="#34A853"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="#FBBC05"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="#EA4335"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
          />
        </svg>
        <span>Sign In</span>
      </button>
    );
  }

  const roleColors: Record<string, { bg: string; text: string; border: string }> = {
    admin: {
      bg: "bg-red-500/15 text-red-400 border-red-500/30",
      text: "text-red-400",
      border: "border-red-500/30",
    },
    editor: {
      bg: "bg-purple-500/15 text-purple-400 border-purple-500/30",
      text: "text-purple-400",
      border: "border-purple-500/30",
    },
    moderator: {
      bg: "bg-amber-500/15 text-amber-400 border-amber-500/30",
      text: "text-amber-400",
      border: "border-amber-500/30",
    },
    viewer: {
      bg: "bg-blue-500/15 text-blue-400 border-blue-500/30",
      text: "text-blue-400",
      border: "border-blue-500/30",
    },
    user: {
      bg: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
      text: "text-emerald-400",
      border: "border-emerald-500/30",
    },
  };

  const currentRoleStyle = roleColors[user.role] || roleColors.user;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group flex items-center gap-2 rounded-full border border-border/60 bg-secondary/40 p-1 pr-2.5 transition-all hover:bg-secondary/80 hover:border-primary/30 focus:outline-none"
        aria-label="User Profile Menu"
      >
        <UserAvatar
          photoURL={user.photoURL}
          name={user.name}
          email={user.email}
          className="h-7 w-7 rounded-full object-cover ring-1 ring-border/50"
          fallbackClassName="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary"
        />
        <span className="hidden text-xs font-medium text-foreground/90 sm:inline-block max-w-[100px] truncate">
          {user.name.split(" ")[0]}
        </span>
        <ChevronDown className="h-3 w-3 text-muted-foreground transition-transform group-hover:text-foreground" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 origin-top-right rounded-xl border border-border/80 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl ring-1 ring-black/10 z-50 animate-in fade-in zoom-in-95 duration-100">
          {/* Header Info */}
          <div className="border-b border-border/60 px-3 py-2.5">
            <div className="flex items-center gap-2.5">
              <UserAvatar
                photoURL={user.photoURL}
                name={user.name}
                email={user.email}
                className="h-9 w-9 rounded-full object-cover ring-1 ring-border"
                fallbackClassName="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">{user.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Role
              </span>
              <span
                className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${currentRoleStyle.bg}`}
              >
                {user.role}
              </span>
            </div>

            {user.nativeLanguage && (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Language
                </span>
                <span className="inline-flex items-center rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                  {user.nativeLanguage}
                </span>
              </div>
            )}

            {user.educationLevel && (
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Standard
                </span>
                <span className="inline-flex items-center rounded-md border border-border bg-surface-2 px-2 py-0.5 text-[10px] font-semibold text-foreground">
                  {user.educationLevel.replace("-", " ").toUpperCase()}
                </span>
              </div>
            )}
          </div>

          {/* Links / Actions */}
          <div className="py-1 space-y-0.5">
            <Link
              to="/support"
              onClick={() => setIsOpen(false)}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-rose-500/10 hover:text-rose-400 group"
            >
              <Heart className="h-4 w-4 text-rose-500 transition-transform group-hover:scale-110 fill-rose-500/20" />
              <span>Support Our Project</span>
            </Link>

            {isAdmin && (
              <Link
                to="/admin"
                onClick={() => setIsOpen(false)}
                className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-foreground/90 transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <ShieldAlert className="h-4 w-4 text-primary" />
                <span>Admin Dashboard</span>
              </Link>
            )}

            <button
              onClick={() => {
                setIsOpen(false);
                signOut();
              }}
              className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
