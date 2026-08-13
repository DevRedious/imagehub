/** Jeu d'icônes de navigation.
 *
 *  Les émojis rendaient chaque vue à la merci de la police de la machine :
 *  taille, graisse et couleur variaient d'un système à l'autre, et rien ne les
 *  accordait aux icônes déjà tracées de « Paramètres » et « À propos ». Ces
 *  tracés-ci héritent de `currentColor`, donc de l'état actif ou survolé du
 *  bouton qui les porte, et gardent le même trait partout.
 */

interface IconProps {
  size?: number;
}

/** Base commune : trait de 2, extrémités arrondies, boîte de 24. */
function Glyph({
  size = 16,
  children,
}: IconProps & { children: React.ReactNode }) {
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
      className="shrink-0"
    >
      {children}
    </svg>
  );
}

/** Studio : une palette de peintre. */
export function StudioIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <path d="M12 3a9 9 0 0 0 0 18 2 2 0 0 0 1.6-3.2 2 2 0 0 1 1.6-3.2h1.9A3.9 3.9 0 0 0 21 10.7C20.6 6.4 16.8 3 12 3Z" />
      <circle cx="7.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="10.5" cy="7.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="8.5" r="1" fill="currentColor" stroke="none" />
    </Glyph>
  );
}

/** Atelier : un pinceau. */
export function EditorIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <path d="M15.5 3.5a2.1 2.1 0 0 1 3 3L9 16l-4 1 1-4Z" />
      <path d="M13.5 5.5l3 3" />
      <path d="M5 20.5c1.6.6 3.2.2 3.9-1a2 2 0 0 0-2.6-2.8" />
    </Glyph>
  );
}

/** Motifs : une tuile qui se répète — quatre carreaux, dont un décalé pour
 *  dire que le motif continue au-delà du cadre. */
export function PatternIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <path d="M13.5 3.5h7.5" />
      <path d="M3.5 13.5v7.5" />
    </Glyph>
  );
}

/** Emojis : un visage souriant. */
export function EmojiIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0" />
      <path d="M9 9.5v.01M15 9.5v.01" />
    </Glyph>
  );
}

/** QR codes : les trois repères et un semis de modules. */
export function QrIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <path d="M14 14h3v3h-3zM20 14v.01M14 20v.01M20 20v.01M17.5 17.5v.01" />
    </Glyph>
  );
}

/** Historique : une horloge avec sa flèche de retour. */
export function HistoryIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <path d="M3.5 9A9 9 0 1 1 3 12" />
      <path d="M3 4v5h5" />
      <path d="M12 7.5V12l3 1.8" />
    </Glyph>
  );
}

/** Paramètres : un engrenage. */
export function GearIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Glyph>
  );
}

/** À propos : un « i » cerclé. */
export function InfoIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 16v-5M12 8.2v.1" />
    </Glyph>
  );
}

/** Corbeille : le geste se lit avant même le survol, là où une croix ne dit
 *  que « fermer ». */
export function TrashIcon({ size = 13 }: IconProps) {
  return (
    <Glyph size={size}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Glyph>
  );
}

/** Projet : un dossier. */
export function ProjectIcon({ size }: IconProps) {
  return (
    <Glyph size={size}>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
    </Glyph>
  );
}
