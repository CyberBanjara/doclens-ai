import { useState } from "react";
import { toast } from "sonner";
import { Star, MessageSquare } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { submitReviewToFirestore } from "@/lib/firebase";
import { useAuth } from "@/context/AuthContext";

import { UserAvatar } from "@/components/UserAvatar";

interface ReviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ReviewModal({ open, onOpenChange }: ReviewModalProps) {
  const { user, userProfile } = useAuth();
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [comment, setComment] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be signed in to submit a review.");
      return;
    }
    if (!comment.trim()) {
      toast.error("Please enter a review message.");
      return;
    }

    setSubmitting(true);
    try {
      await submitReviewToFirestore(rating, comment.trim());
      toast.success("Thank you! Your review has been saved to Firestore.");
      setComment("");
      onOpenChange(false);
    } catch (err: any) {
      console.error("Failed to submit review to Firestore:", err);
      toast.error(err?.message || "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md overflow-hidden rounded-[18px] border border-border bg-card p-6 shadow-2xl z-[999999]">
        <DialogHeader className="space-y-2">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <MessageSquare className="h-5 w-5" />
            </span>
            <div>
              <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
                Add a Review
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Share your experience with Anuwad. Saved directly to Firestore.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* User info preview */}
          {user && (
            <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-2 p-3">
              <UserAvatar
                photoURL={user.photoURL || userProfile?.photoURL}
                name={user.displayName || userProfile?.name}
                email={user.email || userProfile?.email}
                className="h-8 w-8 rounded-full object-cover"
                fallbackClassName="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground"
                iconClassName="h-4 w-4 text-primary-foreground"
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold text-foreground">
                  {user.displayName || userProfile?.name || "Anonymous User"}
                </p>
                <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
              </div>
            </div>
          )}

          {/* Rating stars */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Rating
            </label>
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 transition-transform hover:scale-110 focus:outline-none"
                >
                  <Star
                    className={`h-6 w-6 ${
                      (hoverRating || rating) >= star
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted border-border"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Review text */}
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              Your Review
            </label>
            <textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what you think about Anuwad's AI translations & PDF features..."
              className="w-full rounded-xl border border-border bg-surface p-3 text-xs text-foreground placeholder:text-muted-foreground outline-none transition-colors focus:border-primary"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="rounded-full border border-border px-4 py-2 text-xs font-semibold text-muted-foreground hover:bg-surface-2 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !comment.trim()}
              className="rounded-full bg-primary px-5 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-opacity shadow-sm"
            >
              {submitting ? "Saving..." : "Submit Review"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
