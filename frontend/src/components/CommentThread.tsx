"use client";

import { useEffect, useState } from "react";
import { MentionTextarea } from "@/components/MentionTextarea";
import { Button, Empty } from "@/components/ui";
import { api, apiList } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type { CrmComment } from "@/lib/types";

export function CommentThread({
  endpoint,
  refreshKey = 0,
}: {
  /** e.g. `/api/leads/3/comments/` */
  endpoint: string;
  refreshKey?: number;
}) {
  const [comments, setComments] = useState<CrmComment[]>([]);
  const [body, setBody] = useState("");
  const [replyTo, setReplyTo] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setComments(await apiList<CrmComment>(endpoint));
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load comments");
    }
  }

  useEffect(() => {
    load();
  }, [endpoint, refreshKey]);

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    setError("");
    try {
      await api(endpoint, {
        method: "POST",
        body: JSON.stringify({ body, parent: replyTo }),
      });
      setBody("");
      setReplyTo(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post");
    } finally {
      setBusy(false);
    }
  }

  function renderComment(c: CrmComment, depth = 0) {
    return (
      <div key={c.id} className={depth ? "ml-4 border-l border-[var(--line)] pl-3" : ""}>
        <div className="rounded-md border border-[var(--line)]/60 p-2">
          <div className="flex items-center justify-between gap-2 text-xs text-[var(--muted)]">
            <span className="font-medium text-[var(--fg)]">{c.author.username}</span>
            <span>{formatDateTime(c.created_at)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
          <button
            type="button"
            className="mt-1 text-xs text-[var(--cyan)] hover:underline"
            onClick={() => setReplyTo(c.id)}
          >
            Reply
          </button>
        </div>
        {(c.replies || []).map((r) => renderComment(r, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-[var(--danger)]">{error}</p> : null}
      <div className="space-y-2 pt-10">
        {replyTo ? (
          <p className="text-xs text-[var(--muted)]">
            Replying to #{replyTo}{" "}
            <button type="button" className="text-[var(--cyan)]" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </p>
        ) : null}
        <MentionTextarea value={body} onChange={setBody} disabled={busy} />
        <Button disabled={busy || !body.trim()} onClick={submit}>
          Post comment
        </Button>
      </div>
      <div className="space-y-2">
        {comments.length === 0 ? <Empty>No comments yet.</Empty> : comments.map((c) => renderComment(c))}
      </div>
    </div>
  );
}
