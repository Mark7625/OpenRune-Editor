import { useEffect, useState, type InputHTMLAttributes } from "react";
import { ImagePlus } from "lucide-react";

import { ConfirmationDialog } from "../ui/ConfirmationDialog";
import { readImageFileAsDataUrl } from "../../lib/cache-icon";
import { newProfileId, type LocalCacheProfile } from "../../lib/local-cache-profiles";
import { pickSystemCacheDirectory } from "../../lib/tauri/desktop-cache";
import { isTauriRuntime } from "../../lib/tauri/is-tauri";

interface AddCacheDialogProps {
  open: boolean;
  editing: LocalCacheProfile | null;
  onClose: () => void;
  onSave: (profile: LocalCacheProfile) => void;
  onDelete?: (id: string) => void;
}

export function AddCacheDialog({ open, editing, onClose, onSave, onDelete }: AddCacheDialogProps) {
  const tauri = isTauriRuntime();
  const [name, setName] = useState("");
  const [revision, setRevision] = useState("");
  const [description, setDescription] = useState("");
  const [locationNotes, setLocationNotes] = useState("");
  const [iconDataUrl, setIconDataUrl] = useState<string | undefined>(undefined);
  const [systemCachePath, setSystemCachePath] = useState<string | undefined>(undefined);
  const [useSystemFolder, setUseSystemFolder] = useState(false);
  const [iconError, setIconError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name);
      setRevision(editing.revision);
      setDescription(editing.description ?? "");
      setLocationNotes(editing.locationNotes);
      setIconDataUrl(editing.iconDataUrl);
      setSystemCachePath(editing.systemCachePath);
      setUseSystemFolder(Boolean(editing.useSystemFolder && editing.systemCachePath));
    } else {
      setName("");
      setRevision("");
      setDescription("");
      setLocationNotes("");
      setIconDataUrl(undefined);
      setSystemCachePath(undefined);
      setUseSystemFolder(false);
    }
    setIconError(null);
  }, [editing, open]);

  if (!open) return null;

  const onIconFiles = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    try {
      setIconError(null);
      const data = await readImageFileAsDataUrl(f);
      setIconDataUrl(data);
    } catch (e) {
      setIconError(e instanceof Error ? e.message : String(e));
    }
  };

  const onBrowserFolderFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const first = files[0]!;
    const rel = first.webkitRelativePath || first.name;
    setLocationNotes(rel || "Browser folder selected");
  };

  const onPickSystemFolder = async () => {
    const path = await pickSystemCacheDirectory();
    if (!path) return;
    setSystemCachePath(path);
    setLocationNotes(path);
    setUseSystemFolder(true);
  };

  const save = () => {
    const profile: LocalCacheProfile = {
      id: editing?.id ?? newProfileId(),
      name: name.trim() || "Untitled cache",
      revision: revision.trim(),
      description: description.trim() || undefined,
      locationNotes: locationNotes.trim(),
      iconDataUrl,
      systemCachePath,
      useSystemFolder: tauri && useSystemFolder && Boolean(systemCachePath),
    };
    onSave(profile);
  };

  return (
    <div className="fixed inset-0 z-[450] flex items-center justify-center bg-black/60 p-4">
      <div className="w-[40vw] min-w-[320px] max-w-[760px] rounded-lg border border-border bg-card">
        <div className="border-b border-border px-6 py-4 font-semibold">
          {editing ? "Edit cache" : "Add cache"}
        </div>
        <div className="space-y-3 px-6 py-4">
          <div className="grid gap-3 sm:grid-cols-[128px_1fr]">
            <div className="space-y-1">
              <label className="text-sm font-medium">Icon</label>
              <label className="inline-flex cursor-pointer">
                <span className="inline-flex size-32 items-center justify-center overflow-hidden rounded-md border border-border bg-muted/40">
                  {iconDataUrl ? (
                    <img src={iconDataUrl} alt="" className="size-32 object-cover" />
                  ) : (
                    <ImagePlus className="size-8 text-muted-foreground" />
                  )}
                </span>
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => void onIconFiles(e.target.files)} />
              </label>
              {iconError ? <p className="text-xs text-destructive">{iconError}</p> : null}
            </div>
            <div className="space-y-3">
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Name</span>
                <input className="w-full rounded-md border border-input bg-background px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block text-sm">
                <span className="mb-1 block font-medium">Revision</span>
                <input className="w-full rounded-md border border-input bg-background px-2 py-1.5" value={revision} onChange={(e) => setRevision(e.target.value)} />
              </label>
            </div>
            <label className="block text-sm sm:col-span-2">
              <span className="mb-1 block font-medium">Description</span>
              <textarea rows={3} className="w-full rounded-md border border-input bg-background px-2 py-1.5" value={description} onChange={(e) => setDescription(e.target.value)} />
            </label>
            <div className="space-y-2 sm:col-span-2">
              <div className="flex flex-col gap-2">
                <label className="inline-flex cursor-pointer">
                  <span className="inline-flex h-9 w-full items-center justify-center rounded-md border border-input bg-background px-3 text-sm">
                    Cache Location
                  </span>
                  <input
                    type="file"
                    className="sr-only"
                    multiple
                    {...({ webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
                    onChange={(e) => onBrowserFolderFiles(e.target.files)}
                  />
                </label>
                {tauri ? (
                  <button type="button" className="h-9 rounded-md border border-input bg-secondary px-3 text-sm" onClick={() => void onPickSystemFolder()}>
                    System Cache Location
                  </button>
                ) : null}
              </div>
              {locationNotes ? <p className="text-xs text-muted-foreground">{locationNotes}</p> : null}
              {tauri && systemCachePath ? (
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={useSystemFolder} onChange={(e) => setUseSystemFolder(e.target.checked)} />
                  <span>Load from disk only (desktop only, skip IndexedDB mirror)</span>
                </label>
              ) : null}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
          <button type="button" className="rounded-md border border-input px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          {editing && onDelete ? (
            <button
              type="button"
              className="rounded-md bg-destructive/20 px-3 py-2 text-sm text-destructive"
              onClick={() => setConfirmDeleteOpen(true)}
            >
              Delete
            </button>
          ) : null}
          <button type="button" className="rounded-md bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={save}>
            {editing ? "Save changes" : "Add cache"}
          </button>
        </div>
      </div>
      <ConfirmationDialog
        open={confirmDeleteOpen}
        title="Delete cache profile?"
        description="This removes the cache profile and its imported browser cache files."
        confirmLabel="Delete"
        destructive
        onCancel={() => setConfirmDeleteOpen(false)}
        onConfirm={() => {
          if (editing && onDelete) {
            onDelete(editing.id);
          }
          setConfirmDeleteOpen(false);
        }}
      />
    </div>
  );
}
