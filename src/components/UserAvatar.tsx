import { useState } from "react";
import { User as UserIcon } from "lucide-react";

interface UserAvatarProps {
  photoURL?: string | null;
  name?: string | null;
  email?: string | null;
  className?: string;
  fallbackClassName?: string;
  iconClassName?: string;
}

export function UserAvatar({
  photoURL,
  name,
  email,
  className = "h-8 w-8 rounded-full object-cover ring-1 ring-border/50",
  fallbackClassName = "flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-xs font-bold text-primary shadow-sm ring-1 ring-border/50",
  iconClassName = "h-4 w-4 text-primary",
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const initial = (name?.[0] || email?.[0] || "").toUpperCase();

  if (photoURL && !imageError) {
    return (
      <img
        src={photoURL}
        alt={name || "User profile"}
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setImageError(true)}
        className={className}
        loading="lazy"
      />
    );
  }

  if (initial) {
    return <div className={fallbackClassName}>{initial}</div>;
  }

  return (
    <div className={fallbackClassName}>
      <UserIcon className={iconClassName} />
    </div>
  );
}
