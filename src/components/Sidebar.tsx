import { convertFileSrc } from "@tauri-apps/api/core";
import { stackIcon } from "../lib/icons";
import { KIND_LABEL } from "../lib/project";
import type { SavedProject } from "../lib/projectsStore";

export type View = "studio" | "project" | "about";

/** icône « info » pour la page à propos */
function InfoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8.2v.1" />
    </svg>
  );
}

/** icône « sidebar » classique : panneau avec bande latérale */
function PanelIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </svg>
  );
}

/** placeholder quand le projet n'a pas d'icône d'app détectable */
function AppPlaceholderIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0 text-zinc-500"
    >
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="3.5" />
    </svg>
  );
}

function PlusIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

interface Props {
  collapsed: boolean;
  onToggle: () => void;
  view: View;
  onView: (view: View) => void;
  projects: SavedProject[];
  activeRoot: string | null;
  onOpenProject: (root: string) => void;
  onRemoveProject: (root: string) => void;
  onConnectNew: () => void;
}

/** mode replié : pastille circulaire centrée, hover sur l'élément lui-même */
const railBtn = (active: boolean) =>
  `mx-auto flex h-9 w-9 items-center justify-center rounded-full transition cursor-pointer
   ${active ? "bg-accent-soft text-zinc-100" : "text-zinc-400 hover:scale-110 hover:text-zinc-100"}`;

export function Sidebar({
  collapsed,
  onToggle,
  view,
  onView,
  projects,
  activeRoot,
  onOpenProject,
  onRemoveProject,
  onConnectNew,
}: Props) {
  const navBtn = (active: boolean) =>
    `flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors cursor-pointer
     ${active ? "bg-accent-soft text-zinc-100" : "text-zinc-400 hover:bg-card hover:text-zinc-200"}`;

  // icône réelle de l'app du projet → logo de la stack → placeholder neutre
  const projectIcon = (p: SavedProject, size: number) => {
    const src = p.icon ? convertFileSrc(p.icon) : stackIcon(p.kind);
    return src ? (
      <img
        src={src}
        alt=""
        className="shrink-0 rounded object-contain"
        style={{ width: size, height: size }}
      />
    ) : (
      <AppPlaceholderIcon size={size} />
    );
  };

  return (
    <aside
      className={`flex h-screen shrink-0 flex-col gap-1 border-r border-zinc-800/60 bg-panel p-2 transition-all duration-200
        ${collapsed ? "w-14" : "w-60"}`}
    >
      <div
        className={`mb-2 flex items-center pt-1 ${collapsed ? "justify-center" : "gap-2 px-1.5"}`}
      >
        {collapsed ? (
          // repliée : le logo sert de bouton pour redéployer
          <button
            type="button"
            onClick={onToggle}
            title="Déployer la sidebar"
            className="rounded-full transition-transform hover:scale-110 cursor-pointer"
          >
            <img src="/logo-solo.svg" alt="ImageHub" className="h-7 w-7" />
          </button>
        ) : (
          <>
            <img src="/logo-solo.svg" alt="" className="h-7 w-7 shrink-0" />
            <img src="/name.svg" alt="ImageHub" className="h-4" />
            <button
              type="button"
              onClick={onToggle}
              title="Replier la sidebar"
              className="ml-auto rounded-full p-1.5 text-zinc-500 transition hover:scale-110 hover:text-zinc-200 cursor-pointer"
            >
              <PanelIcon />
            </button>
          </>
        )}
      </div>

      <button
        type="button"
        className={
          collapsed ? railBtn(view === "studio") : navBtn(view === "studio")
        }
        onClick={() => onView("studio")}
        title={collapsed ? "Studio" : undefined}
      >
        <span className="text-base">🎨</span>
        {!collapsed && "Studio"}
      </button>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {!collapsed && (
          <p className="px-2 pb-1 text-[10px] font-semibold tracking-wider text-zinc-600">
            PROJETS ENREGISTRÉS
          </p>
        )}
        {projects.map((p) =>
          collapsed ? (
            <button
              key={p.root}
              type="button"
              onClick={() => onOpenProject(p.root)}
              title={`${p.name} (${KIND_LABEL[p.kind] ?? p.kind})`}
              className={`${railBtn(view === "project" && p.root === activeRoot)} my-0.5`}
            >
              {projectIcon(p, 20)}
            </button>
          ) : (
            <div
              key={p.root}
              className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition-colors
                ${view === "project" && p.root === activeRoot ? "bg-accent-soft text-zinc-100" : "text-zinc-400 hover:bg-card"}`}
            >
              <button
                type="button"
                onClick={() => onOpenProject(p.root)}
                title={`${p.root} (${KIND_LABEL[p.kind] ?? p.kind})`}
                className="flex min-w-0 flex-1 items-center gap-2 text-left cursor-pointer"
              >
                {projectIcon(p, 16)}
                <span className="truncate">{p.name}</span>
              </button>
              <button
                type="button"
                onClick={() => onRemoveProject(p.root)}
                title="Retirer de la liste"
                className="hidden shrink-0 text-zinc-600 transition-transform group-hover:block hover:scale-125 hover:text-red-400 cursor-pointer"
              >
                ✕
              </button>
            </div>
          ),
        )}
        <button
          type="button"
          onClick={onConnectNew}
          title={collapsed ? "Connecter un projet" : undefined}
          className={
            collapsed
              ? `${railBtn(false)} mt-1 text-zinc-500`
              : "mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-zinc-500 transition-colors hover:bg-card hover:text-zinc-200 cursor-pointer"
          }
        >
          <PlusIcon size={collapsed ? 18 : 14} />
          {!collapsed && "Connecter un projet"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => onView("about")}
        title={collapsed ? "À propos" : undefined}
        className={
          collapsed
            ? railBtn(view === "about")
            : `${navBtn(view === "about")} text-xs`
        }
      >
        <InfoIcon size={collapsed ? 18 : 14} />
        {!collapsed && "À propos"}
      </button>
    </aside>
  );
}
