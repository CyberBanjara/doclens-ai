import { useState } from "react";
import { User, LogOut, Star, LogIn } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { ReviewModal } from "@/components/ReviewModal";

export function ProfileDropdown() {
  const { user, signInWithGoogle, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);

  const handleSignIn = async () => {
    setOpen(false);
    await signInWithGoogle();
  };

  const handleSignOut = async () => {
    setOpen(false);
    await signOut();
  };

  const handleOpenReview = () => {
    setOpen(false);
    setReviewOpen(true);
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-border/50 bg-surface/80 text-foreground shadow-sm transition-all hover:bg-surface-2 hover:scale-105 active:scale-95 outline-none"
            aria-label="User profile & account settings"
          >
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt={user.displayName || "Profile"}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <User className="h-5 w-5 text-muted-foreground" />
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          align="end"
          sideOffset={8}
          className="z-[999999] w-60 rounded-2xl border border-border bg-card/95 backdrop-blur-xl p-2 shadow-2xl outline-none"
          style={{ zIndex: 999999 }}
        >
          {user ? (
            <div className="space-y-1">
              {/* Signed in user header */}
              <div className="flex items-center gap-3 rounded-xl bg-surface-2/70 p-2.5">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName || "User"}
                    className="h-9 w-9 rounded-full object-cover border border-primary/20"
                  />
                ) : (
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm">
                    {user.displayName?.[0] || user.email?.[0] || "U"}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-foreground">
                    {user.displayName || "Signed In"}
                  </p>
                  <p className="truncate text-[10px] text-muted-foreground">{user.email}</p>
                </div>
              </div>

              <div className="my-1.5 h-px bg-border/60" />

              {/* Add a Review */}
              <button
                onClick={handleOpenReview}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-primary/10 hover:text-primary"
              >
                <Star className="h-4 w-4 text-amber-500 fill-amber-500/20" />
                <span>Add a Review</span>
              </button>

              <div className="my-1.5 h-px bg-border/60" />

              {/* Log Out */}
              <button
                onClick={handleSignOut}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-semibold text-destructive transition-colors hover:bg-destructive/10"
              >
                <LogOut className="h-4 w-4" />
                <span>Log Out</span>
              </button>
            </div>
          ) : (
            <div className="space-y-2 p-1">
              <div className="px-2 pt-1 pb-0.5">
                <p className="text-xs font-bold text-foreground">Welcome to Anuwad</p>
                <p className="text-[11px] text-muted-foreground">Sign in to save your feedback</p>
              </div>

              <button
                onClick={handleSignIn}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-2.5 px-3 text-xs font-semibold text-primary-foreground shadow-md transition-all hover:opacity-95 active:scale-95"
              >
                <svg className="h-4 w-4 fill-current" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
                </svg>
                <span>Sign in with Google</span>
              </button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <ReviewModal open={reviewOpen} onOpenChange={setReviewOpen} />
    </>
  );
}
