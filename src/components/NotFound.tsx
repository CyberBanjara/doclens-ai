import { Link } from "@tanstack/react-router";

export function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-extrabold text-slate-900 dark:text-foreground tracking-tight">404</h1>
        <h2 className="mt-4 text-2xl font-bold text-slate-800 dark:text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:bg-indigo-700 active:scale-95"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
