"use client";

import { Button } from "@/components/ui";

type TmaLoadMoreProps = {
  shown: number;
  total: number;
  next: string | null;
  loading: boolean;
  onLoadMore: () => void;
};

export function TmaLoadMore({ shown, total, next, loading, onLoadMore }: TmaLoadMoreProps) {
  if (total <= 0) return null;
  return (
    <div className="space-y-2 pt-1">
      <p className="text-center text-xs text-[var(--muted)]">
        Showing {shown} of {total}
      </p>
      {next ? (
        <Button
          variant="ghost"
          className="w-full"
          disabled={loading}
          onClick={onLoadMore}
        >
          {loading ? "Loading…" : "Load more"}
        </Button>
      ) : null}
    </div>
  );
}
