import { useState } from "react";
import { User } from "lucide-react";

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
  className = "h-8 w-8 rounded-full object-cover",
  fallbackClassName = "flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground shadow-sm",
  iconClassName = "h-4 w-4 text-muted-foreground",
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
      />
    );
  }

  if (initial) {
    return <div className={fallbackClassName}>{initial}</div>;
  }

  return (
    <div className={fallbackClassName}>
      <User className={iconClassName} />
    </div>
  );
}
