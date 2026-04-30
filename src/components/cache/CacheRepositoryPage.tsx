import { useEffect, useMemo, useRef, useState, type InputHTMLAttributes } from "react";
import { FolderOpen, ImagePlus, Package, Pencil, Plus } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";

import { AddCacheDialog } from "./AddCacheDialog";
import { ConfirmationDialog } from "../ui/ConfirmationDialog";
import { clearRuntimeLoadedCache, setRuntimeLoadedCache } from "../../lib/active-cache-runtime";
import {
  getActiveProfileIdAsync,
  loadLocalCacheProfilesAsync,
  saveLocalCacheProfilesAsync,
  setActiveProfileIdAsync,
  type LocalCacheProfile,
} from "../../lib/local-cache-profiles";
import {
  deleteProfileCache,
  hasProfileCache,
  loadProfileCache,
  saveProfileCacheFiles,
} from "../../lib/profile-cache-store";

export function CacheRepositoryPage() {
  const navigate = useNavigate();
  const [urlSearchParams] = useSearchParams();
  const [profiles, setProfiles] = useState<LocalCacheProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [editingProfile, setEditingProfile] = useState<LocalCacheProfile | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [savedMap, setSavedMap] = useState<Record<string, boolean>>({});
  const [pendingSwitchProfileId, setPendingSwitchProfileId] = useState<string | null>(null);
  const [pendingImportProfileId, setPendingImportProfileId] = useState<string | null>(null);
  const [draggingProfileId, setDraggingProfileId] = useState<string | null>(null);
  const [autoloadProgress, setAutoloadProgress] = useState<number | null>(null);
  const [autoloadLabel, setAutoloadLabel] = useState("Loading cache...");
  const autoloadStartedRef = useRef(false);
  const importProfileIdRef = useRef<string | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await loadLocalCacheProfilesAsync();
      const active = await getActiveProfileIdAsync();
      if (cancelled) return;
      setProfiles(list);
      setActiveProfileId(active);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(
        profiles.map(async (p) => [p.id, await hasProfileCache(p.id)] as const),
      );
      if (cancelled) return;
      setSavedMap(Object.fromEntries(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [profiles]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.id === activeProfileId) ?? null,
    [activeProfileId, profiles],
  );

  const persist = async (next: LocalCacheProfile[]) => {
    setProfiles(next);
    await saveLocalCacheProfilesAsync(next);
  };

  const onSaveProfile = async (profile: LocalCacheProfile) => {
    const exists = profiles.some((p) => p.id === profile.id);
    const next = exists ? profiles.map((p) => (p.id === profile.id ? profile : p)) : [...profiles, profile];
    await persist(next);
    setActiveProfileId(profile.id);
    await setActiveProfileIdAsync(profile.id);
    setAddOpen(false);
    setEditingProfile(null);
    if (exists) {
      toast.success(`Updated "${profile.name}".`, {
        className: "border border-border border-l-4 border-l-emerald-500 bg-card text-foreground",
      });
      return;
    }

    toast.success(`Added "${profile.name}".`, {
      className: "border border-border border-l-4 border-l-emerald-500 bg-card text-foreground",
    });
    // New profiles should immediately continue into import flow.
    setPendingImportProfileId(profile.id);
  };

  const onDeleteProfile = async (id: string) => {
    await deleteProfileCache(id);
    const next = profiles.filter((p) => p.id !== id);
    await persist(next);
    const nextActive = activeProfileId === id ? next[0]?.id ?? null : activeProfileId;
    setActiveProfileId(nextActive);
    await setActiveProfileIdAsync(nextActive);
    setAddOpen(false);
    setEditingProfile(null);
    toast.success("Profile removed.", {
      className: "border border-border border-l-4 border-l-emerald-500 bg-card text-foreground",
    });
  };

  const loadProfile = async (id: string) => {
    setActiveProfileId(id);
    await setActiveProfileIdAsync(id);
    const p = profiles.find((x) => x.id === id);
    if (!p) {
      return;
    }
    const hasCache = await hasProfileCache(id);
    if (hasCache) {
      try {
        clearRuntimeLoadedCache();
        const loaded = await loadProfileCache(p);
        setRuntimeLoadedCache(p.id, loaded);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e), {
          className: "border border-border border-l-4 border-l-destructive bg-card text-foreground",
        });
        return;
      }
    }
    toast.success(`Ready: "${p.name}". Open Map to use this cache.`, {
      className: "border border-border border-l-4 border-l-emerald-500 bg-card text-foreground",
    });
  };

  const confirmAndLoadProfile = async (id: string) => {
    if (id === activeProfileId) return;
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    if (!savedMap[id]) {
      toast.error(`"${profile.name}" is not imported in browser storage yet. Import it once first.`);
      return;
    }
    setPendingSwitchProfileId(id);
  };

  const startImport = (profileId: string) => {
    setPendingImportProfileId(profileId);
  };

  const onFolderPicked = async (files: FileList | null) => {
    const profileId = importProfileIdRef.current;
    importProfileIdRef.current = null;
    if (!profileId || !files?.length) return;
    const profile = profiles.find((p) => p.id === profileId);
    if (!profile) return;

    try {
      await saveProfileCacheFiles(profileId, files);
      setSavedMap((prev) => ({ ...prev, [profileId]: true }));
      await loadProfile(profileId);
      toast.success(`Imported ${files.length} files into "${profile.name}".`, {
        className: "border border-border border-l-4 border-l-emerald-500 bg-card text-foreground",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e), {
        className: "border border-border border-l-4 border-l-destructive bg-card text-foreground",
      });
    }
  };

  useEffect(() => {
    if (urlSearchParams.get("autoload") !== "1") return;
    if (autoloadStartedRef.current) return;
    if (!activeProfileId || profiles.length === 0) return;

    const profile = profiles.find((p) => p.id === activeProfileId);
    if (!profile) return;

    autoloadStartedRef.current = true;
    setAutoloadProgress(10);
    setAutoloadLabel(`Opening "${profile.name}"...`);

    (async () => {
      try {
        setAutoloadProgress(40);
        clearRuntimeLoadedCache();
        const loaded = await loadProfileCache(profile);
        setAutoloadProgress(85);
        setRuntimeLoadedCache(profile.id, loaded);
        setAutoloadProgress(100);
        setAutoloadLabel("Cache ready. Returning...");
        const returnTo = urlSearchParams.get("returnTo") || "/map";
        setTimeout(() => {
          navigate(returnTo, { replace: true });
        }, 250);
      } catch (e) {
        autoloadStartedRef.current = false;
        setAutoloadProgress(null);
        toast.error(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [activeProfileId, navigate, profiles, urlSearchParams]);

  const moveProfileBefore = async (dragId: string, targetId: string) => {
    if (dragId === targetId) return;
    const dragIndex = profiles.findIndex((p) => p.id === dragId);
    const targetIndex = profiles.findIndex((p) => p.id === targetId);
    if (dragIndex < 0 || targetIndex < 0) return;

    const next = [...profiles];
    const [dragged] = next.splice(dragIndex, 1);
    next.splice(targetIndex, 0, dragged);
    await persist(next);
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-4">
      {autoloadProgress !== null ? (
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="mx-auto w-full max-w-xl rounded-lg border border-border/80 bg-background/80 p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium">Preparing cache</p>
              <span className="rounded bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
                {Math.max(0, Math.min(100, autoloadProgress))}%
              </span>
            </div>
            <p className="mb-3 text-sm text-muted-foreground">{autoloadLabel}</p>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, autoloadProgress))}%` }}
              />
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">OpenRune</p>
        <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold tracking-tight">
          <Package className="size-6" />
          Cache repository
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Add cache profiles (icon, revision, description, location), mark one active, and keep your cache catalog ready.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm transition-colors hover:bg-muted"
            onClick={() => {
              setEditingProfile(null);
              setAddOpen(true);
            }}
          >
            <Plus className="size-4" />
            Add cache
          </button>
          {activeProfile ? (
            <span className="inline-flex items-center rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
              Active: {activeProfile.name}
            </span>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="space-y-2">
          {profiles.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
              No caches yet. Click Add cache to create your first cache profile.
            </div>
          ) : (
            profiles.map((p) => {
              const active = p.id === activeProfileId;
              const saved = savedMap[p.id] === true;
              return (
                <div
                  key={p.id}
                  className={`rounded-lg border bg-card p-3 transition-colors ${active ? "border-emerald-500/60" : "border-border hover:border-primary/40"} cursor-pointer`}
                  onClick={() => void confirmAndLoadProfile(p.id)}
                  draggable
                  onDragStart={(e) => {
                    setDraggingProfileId(p.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", p.id);
                  }}
                  onDragEnd={() => setDraggingProfileId(null)}
                  onDragOver={(e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dragId = e.dataTransfer.getData("text/plain") || draggingProfileId;
                    if (dragId) {
                      void moveProfileBefore(dragId, p.id);
                    }
                    setDraggingProfileId(null);
                  }}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-3">
                      <div className="flex shrink-0 items-center">
                        {p.iconDataUrl ? (
                          <img
                            src={p.iconDataUrl}
                            alt=""
                            className="size-20 rounded border border-border object-cover"
                          />
                        ) : (
                          <div className="flex size-20 items-center justify-center rounded border border-dashed border-border bg-muted/30">
                            <ImagePlus className="size-6 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          {p.revision ? (
                            <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground">
                              rev {p.revision}
                            </span>
                          ) : null}
                          {saved ? (
                            <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-xs text-emerald-300">
                              Saved in browser
                            </span>
                          ) : (
                            <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs text-amber-300">
                              Not imported yet
                            </span>
                          )}
                        </div>
                        {p.description ? <p className="mt-1 text-xs text-muted-foreground">{p.description}</p> : null}
                        {p.locationNotes ? <p className="mt-1 text-xs text-muted-foreground">{p.locationNotes}</p> : null}
                      </div>
                    </div>

                    <div className="ml-auto flex flex-col gap-1 self-start" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        className="inline-flex h-9 w-[132px] items-center justify-center gap-1 rounded-md border border-input px-3 py-2 text-xs font-medium"
                        onClick={() => {
                          setEditingProfile(p);
                          setAddOpen(true);
                        }}
                      >
                        <Pencil className="size-3.5" />
                        Manage
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-9 w-[132px] items-center justify-center gap-1 rounded-md border border-input px-3 py-2 text-xs font-medium"
                        onClick={() => startImport(p.id)}
                      >
                        <FolderOpen className="size-3.5" />
                        Update cache
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>

      <AddCacheDialog
        open={addOpen}
        editing={editingProfile}
        onClose={() => {
          setAddOpen(false);
          setEditingProfile(null);
        }}
        onSave={(p) => void onSaveProfile(p)}
        onDelete={(id) => void onDeleteProfile(id)}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="sr-only"
        multiple
        {...({ webkitdirectory: "" } as InputHTMLAttributes<HTMLInputElement>)}
        onChange={(e) => void onFolderPicked(e.target.files)}
      />
      <ConfirmationDialog
        open={pendingSwitchProfileId !== null}
        title="Switch active cache?"
        description={
          pendingSwitchProfileId
            ? `Set "${
                profiles.find((p) => p.id === pendingSwitchProfileId)?.name ?? "this cache"
              }" as the active cache for Map?`
            : ""
        }
        confirmLabel="Switch"
        onCancel={() => setPendingSwitchProfileId(null)}
        onConfirm={() => {
          const id = pendingSwitchProfileId;
          setPendingSwitchProfileId(null);
          if (id) {
            void loadProfile(id);
          }
        }}
      />
      <ConfirmationDialog
        open={pendingImportProfileId !== null}
        title="Import cache files?"
        description={
          pendingImportProfileId
            ? `This will import selected files into "${
                profiles.find((p) => p.id === pendingImportProfileId)?.name ?? "this profile"
              }" browser storage.`
            : ""
        }
        confirmLabel="Continue"
        onCancel={() => setPendingImportProfileId(null)}
        onConfirm={() => {
          const id = pendingImportProfileId;
          setPendingImportProfileId(null);
          if (!id) return;
          importProfileIdRef.current = id;
          folderInputRef.current?.click();
        }}
      />
    </div>
  );
}
