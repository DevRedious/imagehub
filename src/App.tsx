import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AboutView } from "./components/AboutView";
import { ConfirmDeleteModal } from "./components/ConfirmDeleteModal";
import { ConfirmFilesModal } from "./components/ConfirmFilesModal";
import { JobList } from "./components/JobList";
import { Lightbox } from "./components/Lightbox";
import { OutputSelect } from "./components/OutputSelect";
import { ProjectSkeleton } from "./components/ProjectSkeleton";
import { ProjectView } from "./components/ProjectView";
import { ScanModal } from "./components/ScanModal";
import { Sidebar, type View } from "./components/Sidebar";
import { StudioView } from "./components/StudioView";
import { type Toast, Toaster, type ToastKind } from "./components/Toaster";
import { UpdatedModal } from "./components/UpdatedModal";
import { UpdateModal } from "./components/UpdateModal";
import {
  ACTIONS,
  actionAccepts,
  BG_MODELS,
  type BgModel,
  type QualityPreset,
  qualityValue,
  type ToolsStatus,
} from "./lib/actions";
import {
  loadOutputPrefs,
  type OutputPrefs,
  saveOutputPrefs,
} from "./lib/output";
import { basename, isSupportedImage } from "./lib/paths";
import {
  type HeavyImage,
  type ImageUsages,
  loadProjectRoot,
  type ProjectInfo,
  type ScanState,
  saveProjectRoot,
} from "./lib/project";
import {
  loadProjects,
  removeProject,
  type SavedProject,
  saveProject,
} from "./lib/projectsStore";
import { qualityScore } from "./lib/score";
import {
  checkForUpdate,
  clearJustUpdated,
  pendingUpdatedVersion,
  type Update,
} from "./lib/updater";
import type { ActionId, Job, JobProgressEvent } from "./types/job";

interface OptimizeRun {
  remaining: Set<string>;
  converted: { from: string; to: string }[];
}

const SIDEBAR_KEY = "imagehub.sidebarCollapsed";
const QUALITY_KEY = "imagehub.avifQuality";
const AGGRO_KEY = "imagehub.bgAggressiveness";
const BG_MODEL_KEY = "imagehub.bgModel";

export default function App() {
  const [staged, setStaged] = useState<string[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [outputPrefs, setOutputPrefs] = useState<OutputPrefs>(loadOutputPrefs);
  const [quality, setQuality] = useState<QualityPreset>(
    () =>
      (localStorage.getItem(QUALITY_KEY) as QualityPreset | null) ?? "balanced",
  );
  const [aggressiveness, setAggressiveness] = useState<number>(() => {
    const raw = localStorage.getItem(AGGRO_KEY);
    if (raw === null) return 50;
    const v = Number(raw);
    return Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 50;
  });
  const [bgModel, setBgModel] = useState<BgModel>(
    () => (localStorage.getItem(BG_MODEL_KEY) as BgModel | null) ?? "u2net",
  );
  const [view, setView] = useState<View>("studio");
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_KEY) === "1",
  );
  const [savedProjects, setSavedProjects] =
    useState<SavedProject[]>(loadProjects);
  const [project, setProject] = useState<ProjectInfo | null>(null);
  const [scan, setScan] = useState<ScanState>({
    status: "idle",
    done: 0,
    total: 0,
  });
  const [usages, setUsages] = useState<Record<string, ImageUsages> | null>(
    null,
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [optimizing, setOptimizing] = useState(false);
  const [scanModalName, setScanModalName] = useState<string | null>(null);
  const [scanModalKind, setScanModalKind] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<SavedProject | null>(null);
  const [confirmFiles, setConfirmFiles] = useState<HeavyImage[] | null>(null);
  // false = watcher temps réel indisponible (limite inotify, montage réseau…)
  // → le bouton « Réanalyser » réapparaît en secours dans ProjectView
  const [watcherOk, setWatcherOk] = useState(true);
  // aperçu plein écran d'un original (lightbox), chargé à la demande
  const [preview, setPreview] = useState<string | null>(null);
  // disponibilité des moteurs CLI (grise les actions dont l'outil manque)
  const [tools, setTools] = useState<ToolsStatus | null>(null);
  // mise à jour disponible (auto-updater Tauri), proposée au démarrage
  const [update, setUpdate] = useState<Update | null>(null);
  // version fraîchement installée à confirmer après un redémarrage de MAJ
  const [updatedTo, setUpdatedTo] = useState<string | null>(null);
  // messages éphémères (feedback non bloquant)
  const [toasts, setToasts] = useState<Toast[]>([]);

  const pushToast = useCallback((kind: ToastKind, message: string) => {
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev, { id, kind, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  const dismissToast = useCallback(
    (id: string) => setToasts((prev) => prev.filter((t) => t.id !== id)),
    [],
  );

  useEffect(() => {
    invoke<ToolsStatus>("check_tools")
      .then(setTools)
      .catch(() => {});
  }, []);

  // vérifie en arrière-plan si une nouvelle version est publiée
  useEffect(() => {
    checkForUpdate().then((r) => {
      if (r.status === "available") setUpdate(r.update);
    });
  }, []);

  // après un redémarrage de mise à jour : confirme une seule fois, si la
  // version installée correspond bien (sinon le marqueur est nettoyé en silence).
  useEffect(() => {
    const pending = pendingUpdatedVersion();
    if (!pending) return;
    getVersion()
      .then((v) => {
        if (v === pending) setUpdatedTo(v);
        else clearJustUpdated();
      })
      .catch(() => {});
  }, []);

  // vérification manuelle (page À propos) : ouvre la modale si une MAJ existe,
  // et renvoie le résultat pour l'affichage d'état dans la page.
  const checkUpdatesManually = useCallback(async () => {
    const r = await checkForUpdate();
    if (r.status === "available") setUpdate(r.update);
    return r;
  }, []);

  const optimizeRef = useRef<OptimizeRun | null>(null);
  const projectRef = useRef<ProjectInfo | null>(null);
  const usagesRef = useRef<Record<string, ImageUsages> | null>(null);
  const jobsRef = useRef<Job[]>([]);
  // n'avertir qu'une fois par session du téléchargement d'un modèle non standard
  const modelNoticeRef = useRef(false);
  projectRef.current = project;
  usagesRef.current = usages;
  jobsRef.current = jobs;

  // cache de session par projet : bascule instantanée entre projets connus
  // (la fraîcheur est assurée par une ré-analyse silencieuse à la bascule)
  interface ProjectCacheEntry {
    project: ProjectInfo;
    usages: Record<string, ImageUsages> | null;
    selected: Set<string>;
  }
  const projectCacheRef = useRef(new Map<string, ProjectCacheEntry>());

  // l'entrée du projet actif suit l'état courant
  useEffect(() => {
    if (project) {
      projectCacheRef.current.set(project.root, { project, usages, selected });
    }
  }, [project, usages, selected]);

  function updateOutputPrefs(prefs: OutputPrefs) {
    setOutputPrefs(prefs);
    saveOutputPrefs(prefs);
  }

  function updateQuality(q: QualityPreset) {
    setQuality(q);
    localStorage.setItem(QUALITY_KEY, q);
  }

  function updateAggressiveness(v: number) {
    setAggressiveness(v);
    localStorage.setItem(AGGRO_KEY, String(v));
  }

  function updateBgModel(m: BgModel) {
    setBgModel(m);
    localStorage.setItem(BG_MODEL_KEY, m);
  }

  function toggleSidebar() {
    setCollapsed((c) => {
      localStorage.setItem(SIDEBAR_KEY, c ? "0" : "1");
      return !c;
    });
  }

  const scanUsages = useCallback(async (root: string, paths: string[]) => {
    if (paths.length === 0) {
      setUsages({});
      setScan({ status: "done", done: 0, total: 0 });
      return;
    }
    setScan({ status: "running", done: 0, total: 0 });
    try {
      const result = await invoke<ImageUsages[]>("scan_image_usages", {
        root,
        images: paths,
      });
      setUsages(Object.fromEntries(result.map((u) => [u.path, u])));
      setScan((s) => ({ ...s, status: "done" }));
    } catch {
      setScan({ status: "idle", done: 0, total: 0 });
    }
  }, []);

  const lastAnalyzeRef = useRef(0);
  const analyzingRef = useRef(false);

  const doAnalyze = useCallback(
    async (root: string) => {
      const previous = projectRef.current;
      const info = await invoke<ProjectInfo>("analyze_project", { root });
      setProject(info);
      setScanModalKind(info.kind);
      saveProjectRoot(root);
      setSavedProjects(
        saveProject({
          root: info.root,
          name: info.name,
          kind: info.kind,
          icon: info.icon,
        }),
      );
      // même projet → préserver les choix de l'utilisateur (décochées le restent),
      // seules les images inconnues arrivent cochées ; autre projet → tout coché
      const sameProject = previous?.root === info.root;
      const known = new Set(previous?.heavy.map((h) => h.path) ?? []);
      setSelected(
        (prev) =>
          new Set(
            info.heavy
              .map((h) => h.path)
              .filter((p) => !sameProject || prev.has(p) || !known.has(p)),
          ),
      );
      // même projet : on garde les anciens usages affichés pendant le re-scan
      // (stale-while-revalidate) ; autre projet : repartir à vide
      if (!sameProject) setUsages(null);
      // scan de TOUTES les images (la détection d'inutilisés en dépend)
      scanUsages(
        info.root,
        info.images.map((h) => h.path),
      );
    },
    [scanUsages],
  );

  /** analyse avec garde-fous : horodatage anti-rafale + drapeau « en cours » */
  const analyze = useCallback(
    async (root: string) => {
      lastAnalyzeRef.current = Date.now();
      analyzingRef.current = true;
      try {
        await doAnalyze(root);
      } finally {
        analyzingRef.current = false;
      }
    },
    [doAnalyze],
  );

  // dérivés du scan : assets morts, déjà optimisés, score qualité
  const unused = useMemo(() => {
    if (!project || !usages || scan.status !== "done") return [];
    return project.images.filter(
      (img) => (usages[img.path]?.usages ?? []).length === 0,
    );
  }, [project, usages, scan.status]);

  const optimized = useMemo(
    () => project?.images.filter((i) => /\.(avif|webp)$/i.test(i.path)) ?? [],
    [project],
  );

  const score = useMemo(() => {
    if (!project) return 100;
    const totalBytes = project.stats.reduce((n, s) => n + s.bytes, 0);
    return qualityScore(
      totalBytes,
      project.heavy_bytes,
      project.heavy.length,
      unused.length,
    );
  }, [project, unused]);

  async function deleteUnusedFiles(items: HeavyImage[]) {
    const root = projectRef.current?.root;
    try {
      await invoke("delete_files", { paths: items.map((i) => i.path) });
    } finally {
      setConfirmFiles(null);
      if (root) analyze(root).catch(() => {});
    }
  }

  // reconnexion silencieuse au dernier projet
  useEffect(() => {
    const root = loadProjectRoot();
    if (root) analyze(root).catch(() => saveProjectRoot(null));
  }, [analyze]);

  const armWatcher = useCallback((root: string) => {
    invoke("watch_project", { root })
      .then(() => setWatcherOk(true))
      .catch(() => setWatcherOk(false));
  }, []);

  // app vivante : watcher temps réel sur la racine du projet connecté
  // (le backend débounce 1 s et n'émet que pour les fichiers image/code).
  // Pas de cleanup : watch_project remplace l'ancien watcher côté Rust,
  // ce qui évite toute course unwatch/watch entre deux invocations async.
  useEffect(() => {
    if (project?.root) {
      armWatcher(project.root);
    } else {
      invoke("unwatch_project").catch(() => {});
      setWatcherOk(true);
    }
  }, [project?.root, armWatcher]);

  // changement détecté → ré-analyse silencieuse (jamais pendant une
  // optimisation ni une analyse déjà en cours, anti-rafale 2 s)
  useEffect(() => {
    const unlisten = listen("project-fs-change", () => {
      const proj = projectRef.current;
      if (!proj || optimizeRef.current || analyzingRef.current) return;
      if (Date.now() - lastAnalyzeRef.current < 2_000) return;
      analyze(proj.root).catch(() => {});
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [analyze]);

  // progression du scan chirurgical
  useEffect(() => {
    const unlisten = listen<{ done: number; total: number }>(
      "scan-progress",
      ({ payload }) => {
        setScan((s) => (s.status === "running" ? { ...s, ...payload } : s));
      },
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // fin d'une optimisation AVIF groupée → prompt chirurgical de mise à jour des références
  const onOptimizeJobEnd = useCallback(
    (payload: JobProgressEvent, jobPath: string) => {
      const run = optimizeRef.current;
      if (!run) return;
      if (!run.remaining.has(payload.job_id)) return;
      run.remaining.delete(payload.job_id);
      if (payload.status === "done" && payload.output) {
        run.converted.push({ from: jobPath, to: payload.output });
      }
      if (run.remaining.size > 0) return;

      optimizeRef.current = null;
      setOptimizing(false);
      const proj = projectRef.current;
      if (run.converted.length === 0 || !proj) return;

      const rel = (p: string) =>
        p.startsWith(proj.root) ? p.slice(proj.root.length + 1) : p;
      const allUsages = usagesRef.current ?? {};
      const lines = run.converted
        .map((c) => {
          const refs = allUsages[c.from]?.usages ?? [];
          const where =
            refs.length > 0
              ? `\n    références exactes à corriger : ${refs.map((u) => `${u.file}:${u.line}`).join(", ")}`
              : "\n    aucune référence connue (vérifie quand même par recherche globale)";
          return `- ${rel(c.from)} → ${rel(c.to)}${where}`;
        })
        .join("\n");
      const prompt =
        `Des images de ce projet viennent d'être converties en AVIF pour alléger le poids ` +
        `(les originaux PNG/JPG ont été supprimés).\nRacine du projet : ${proj.root}\n\n` +
        `Conversions effectuées, avec les emplacements exacts relevés par scan du code :\n${lines}\n\n` +
        `À faire : mets à jour chaque référence listée vers la nouvelle extension .avif, ` +
        `fais ensuite une recherche globale sur les anciens noms de fichiers pour attraper ` +
        `tout usage construit dynamiquement, puis lance build/lint pour vérifier que rien ne casse.`;
      invoke("deliver_prompt", {
        title: "Optimisation AVIF terminée ✅",
        prompt,
      }).catch(() => {});
      analyze(proj.root).catch(() => {});
    },
    [analyze],
  );

  useEffect(() => {
    const jobsPaths = new Map<string, string>();
    const unlisten = listen<JobProgressEvent>("job-progress", ({ payload }) => {
      setJobs((prev) => {
        const job = prev.find((j) => j.id === payload.job_id);
        if (job) jobsPaths.set(job.id, job.path);
        if (
          (payload.status === "done" || payload.status === "error") &&
          jobsPaths.has(payload.job_id)
        ) {
          onOptimizeJobEnd(payload, jobsPaths.get(payload.job_id) ?? "");
        }
        return prev.map((j) =>
          j.id === payload.job_id
            ? {
                ...j,
                status: payload.status,
                progress: payload.progress,
                output: payload.output,
                error: payload.error,
              }
            : j,
        );
      });
      // notification proactive en cas d'échec (au-delà de la file de jobs)
      if (payload.status === "error") {
        const name =
          jobsRef.current.find((j) => j.id === payload.job_id)?.name ??
          "Traitement";
        const msg = (payload.error ?? "échec").split("\n")[0].slice(0, 140);
        pushToast("error", `${name} : ${msg}`);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [onOptimizeJobEnd, pushToast]);

  const addFiles = useCallback(
    (paths: string[]) => {
      // écarte dossiers et fichiers non-image (silencieux jusqu'ici)
      const ok = paths.filter(isSupportedImage);
      const ignored = paths.length - ok.length;
      if (ignored > 0) {
        pushToast(
          "info",
          `${ignored} fichier(s) ignoré(s) (format non pris en charge)`,
        );
      }
      if (ok.length > 0) setStaged((prev) => [...new Set([...prev, ...ok])]);
    },
    [pushToast],
  );

  function launchJob(job: Job) {
    invoke("run_action", {
      jobId: job.id,
      path: job.path,
      action: job.action,
      outputMode: outputPrefs.mode,
      customDir: outputPrefs.customDir,
      projectKind: projectRef.current?.kind ?? null,
      projectRoot: projectRef.current?.root ?? null,
      quality: qualityValue(quality),
      aggressiveness,
      model: bgModel,
    }).catch((e) => {
      setJobs((prev) =>
        prev.map((j) =>
          j.id === job.id ? { ...j, status: "error", error: String(e) } : j,
        ),
      );
    });
  }

  function runAction(action: ActionId) {
    const def = ACTIONS.find((a) => a.id === action);
    if (!def) return;
    const eligible = staged.filter((p) => actionAccepts(def, p));
    // plus de silence : aucun fichier compatible → on explique pourquoi
    if (eligible.length === 0) {
      const need = def.accepts.length ? def.accepts.join(", ") : "une image";
      pushToast(
        "error",
        `Aucun fichier compatible avec « ${def.label} » — ${need} requis`,
      );
      return;
    }
    const ignored = staged.length - eligible.length;
    if (ignored > 0) {
      pushToast(
        "info",
        `${ignored} fichier(s) ignoré(s) — incompatibles avec « ${def.label} »`,
      );
    }
    // rappel (une fois) du téléchargement d'un modèle de détourage non standard
    if (
      (action === "removeBg" || action === "bgToAvif") &&
      bgModel !== "u2net" &&
      !modelNoticeRef.current
    ) {
      modelNoticeRef.current = true;
      const label = BG_MODELS.find((m) => m.id === bgModel)?.label ?? bgModel;
      pushToast(
        "info",
        `Modèle « ${label} » : 1er usage = téléchargement, ça peut prendre un moment`,
      );
    }
    const newJobs: Job[] = eligible.map((path) => ({
      id: crypto.randomUUID(),
      path,
      name: basename(path),
      action,
      status: "pending",
      progress: 0,
    }));
    setJobs((prev) => [...newJobs, ...prev]);
    setStaged((prev) => prev.filter((p) => !eligible.includes(p)));
    for (const job of newJobs) launchJob(job);
  }

  /** analyse avec modale de scan « théâtrale » */
  function analyzeWithModal(root: string) {
    setScanModalKind(null);
    setScanModalName(basename(root));
    analyze(root).catch(() => {
      setScanModalName(null);
      setSavedProjects(removeProject(root));
    });
  }

  async function connectProject() {
    const dir = await open({ directory: true });
    if (typeof dir === "string") {
      analyzeWithModal(dir);
      setView("project");
    }
  }

  function openSavedProject(root: string) {
    if (projectRef.current?.root !== root) {
      const cached = projectCacheRef.current.get(root);
      if (cached) {
        // bascule instantanée sur les données connues…
        setProject(cached.project);
        projectRef.current = cached.project; // pour le sameProject d'analyze
        setUsages(cached.usages);
        setSelected(cached.selected);
        setScan({ status: "done", done: 0, total: 0 });
        // …puis rafraîchissement silencieux (le watcher ne surveillait
        // que l'ancien projet actif, des fichiers ont pu changer ici)
        analyze(root).catch(() => {});
      } else {
        analyzeWithModal(root);
      }
    }
    setView("project");
  }

  function disconnectProject() {
    setProject(null);
    setUsages(null);
    setSelected(new Set());
    saveProjectRoot(null);
    setView("studio");
  }

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function optimizeSelection() {
    if (!project) return;
    const paths = project.heavy
      .map((h) => h.path)
      .filter((p) => selected.has(p));
    if (paths.length === 0) return;
    const newJobs: Job[] = paths.map((path) => ({
      id: crypto.randomUUID(),
      path,
      name: basename(path),
      action: "optimizeAvif",
      status: "pending",
      progress: 0,
    }));
    optimizeRef.current = {
      remaining: new Set(newJobs.map((j) => j.id)),
      converted: [],
    };
    setOptimizing(true);
    setJobs((prev) => [...newJobs, ...prev]);
    for (const job of newJobs) launchJob(job);
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar
        collapsed={collapsed}
        onToggle={toggleSidebar}
        view={view}
        onView={setView}
        projects={savedProjects}
        activeRoot={project?.root ?? null}
        onOpenProject={openSavedProject}
        onRemoveProject={(root) =>
          setConfirmDelete(savedProjects.find((p) => p.root === root) ?? null)
        }
        onConnectNew={connectProject}
      />

      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="flex w-full flex-col gap-4 p-6">
          <header className="flex items-center gap-3">
            <h1 className="text-base font-semibold text-zinc-300">
              {view === "studio"
                ? "🎨 Studio"
                : view === "about"
                  ? "ℹ️ À propos"
                  : "📂 Projet"}
            </h1>
            {view !== "about" && (
              <div className="ml-auto">
                <OutputSelect
                  prefs={outputPrefs}
                  onChange={updateOutputPrefs}
                />
              </div>
            )}
          </header>

          {view === "about" ? (
            <AboutView onCheckForUpdates={checkUpdatesManually} />
          ) : view === "project" && scanModalName ? (
            <ProjectSkeleton />
          ) : view === "studio" || !project ? (
            <StudioView
              staged={staged}
              onAddFiles={addFiles}
              onRemoveStaged={(p) =>
                setStaged((prev) => prev.filter((x) => x !== p))
              }
              onRun={runAction}
              onPreview={setPreview}
              tools={tools}
              quality={quality}
              onQualityChange={updateQuality}
              aggressiveness={aggressiveness}
              onAggressivenessChange={updateAggressiveness}
              bgModel={bgModel}
              onBgModelChange={updateBgModel}
            />
          ) : (
            <ProjectView
              key={project.root}
              project={project}
              scan={scan}
              usages={usages}
              selected={selected}
              optimizing={optimizing}
              score={score}
              optimized={optimized}
              unused={unused}
              onDeleteUnused={(items) => setConfirmFiles(items)}
              onPreview={setPreview}
              onToggle={toggleSelected}
              onSelectAll={(all) =>
                setSelected(
                  all ? new Set(project.heavy.map((h) => h.path)) : new Set(),
                )
              }
              onOptimize={optimizeSelection}
              // secours uniquement : la ré-analyse est automatique tant que
              // le watcher tourne ; au clic on retente aussi de l'armer
              onRefresh={
                watcherOk
                  ? null
                  : () => {
                      armWatcher(project.root);
                      analyzeWithModal(project.root);
                    }
              }
            />
          )}

          <JobList
            jobs={jobs}
            onClear={() =>
              setJobs((prev) => prev.filter((j) => j.status !== "done"))
            }
          />
        </div>
      </main>

      {preview && <Lightbox path={preview} onClose={() => setPreview(null)} />}

      {update && (
        <UpdateModal update={update} onDismiss={() => setUpdate(null)} />
      )}

      {updatedTo && (
        <UpdatedModal
          version={updatedTo}
          onClose={() => {
            clearJustUpdated();
            setUpdatedTo(null);
          }}
        />
      )}

      {scanModalName && (
        <ScanModal
          name={scanModalName}
          kind={scanModalKind}
          done={scan.status === "done"}
          onClose={() => setScanModalName(null)}
        />
      )}

      {confirmFiles && (
        <ConfirmFilesModal
          items={confirmFiles}
          onCancel={() => setConfirmFiles(null)}
          onConfirm={() => deleteUnusedFiles(confirmFiles)}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteModal
          project={confirmDelete}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => {
            setSavedProjects(removeProject(confirmDelete.root));
            projectCacheRef.current.delete(confirmDelete.root);
            // si le projet retiré est celui affiché → déconnexion + retour Studio
            if (projectRef.current?.root === confirmDelete.root) {
              disconnectProject();
            }
            setConfirmDelete(null);
          }}
        />
      )}

      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
