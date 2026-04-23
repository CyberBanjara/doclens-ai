import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Dropzone } from "./Dropzone";
import { createDoc, deleteDoc, listDocs, renameDoc, type DocSummary } from "@/lib/storage";

interface Props {
  onOpenSettings: () => void;
}

export function Library({ onOpenSettings }: Props) {
  const [docs, setDocs] = useState<DocSummary[] | null>(null);
  const navigate = useNavigate();

  const refresh = () => listDocs().then(setDocs);

  useEffect(() => {
    refresh();
  }, []);

  const handleFile = async (f: File) => {
    const buf = await f.arrayBuffer();
    const doc = await createDoc(f.name, f.size, buf);
    navigate({ to: "/doc/$id", params: { id: doc.id } });
  };

  const onDelete = async (id: string) => {
    await deleteDoc(id);
    refresh();
  };

  const onRename = async (id: string, name: string) => {
    await renameDoc(id, name);
    refresh();
  };

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <Header onOpenSettings={onOpenSettings} />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Document Library</h2>
              <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                stored locally · indexeddb · nothing leaves this browser
              </p>
            </div>
            <span className="font-mono text-[11px] text-muted-foreground">
              {docs?.length ?? 0} document{docs?.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mb-8 h-56">
            <Dropzone onFile={handleFile} />
          </div>

          {docs && docs.length > 0 ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((d) => (
                <DocCard key={d.id} doc={d} onDelete={onDelete} onRename={onRename} />
              ))}
            </ul>
          ) : (
            <div className="rounded-md border border-dashed border-border bg-surface p-8 text-center">
              <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                no documents yet
              </div>
              <p className="mt-2 text-sm text-foreground/80">
                Drop a PDF above to add it to your library.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

function DocCard({
  doc,
  onDelete,
  onRename,
}: {
  doc: DocSummary;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(doc.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    const trimmed = name.trim();
    if (trimmed && trimmed !== doc.name) onRename(doc.id, trimmed);
    else setName(doc.name);
  };

  return (
    <li className="group relative flex flex-col rounded-md border border-border bg-surface p-4 transition-colors hover:border-border-strong">
      <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        pdf · {(doc.size / 1024).toFixed(1)} kb
      </div>
      {editing ? (
        <input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setName(doc.name);
              setEditing(false);
            }
          }}
          className="rounded border border-primary bg-background px-2 py-1 text-sm font-medium text-foreground outline-none"
        />
      ) : (
        <Link
          to="/doc/$id"
          params={{ id: doc.id }}
          className="line-clamp-2 text-sm font-medium text-foreground hover:text-primary"
        >
          {doc.name}
        </Link>
      )}
      <div className="mt-3 flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        <span>
          {doc.pages == null ? "unanalyzed" : `${doc.pages} pages`}
        </span>
        <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
      </div>
      <div className="mt-3 flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={() => setEditing(true)}
          className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
        >
          rename
        </button>
        <button
          onClick={() => {
            if (confirm(`Delete "${doc.name}"?`)) onDelete(doc.id);
          }}
          className="rounded border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground hover:text-destructive"
        >
          delete
        </button>
      </div>
    </li>
  );
}

function Header({ onOpenSettings }: { onOpenSettings: () => void }) {
  return (
    <header className="flex items-center justify-between border-b border-border bg-surface px-5 py-3">
      <Link to="/" className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary font-mono text-sm font-bold text-primary-foreground">
          ◐
        </div>
        <div className="flex items-baseline gap-2">
          <h1 className="text-base font-semibold tracking-tight">DocLens</h1>
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            client-side pdf intelligence
          </span>
        </div>
      </Link>
      <button
        onClick={onOpenSettings}
        className="rounded-md border border-border bg-background px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground"
      >
        ⚙ settings
      </button>
    </header>
  );
}
