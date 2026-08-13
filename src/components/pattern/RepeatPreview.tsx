import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import type { Pattern } from "../../lib/pattern/types";
import { PatternStage } from "./PatternStage";

interface Props {
  pattern: Pattern;
  images: Map<string, HTMLImageElement>;
  /** côté d'une tuile à l'écran, en pixels */
  cell: number;
  /** damier sous le motif, pour distinguer un fond transparent d'un fond blanc */
  checker?: boolean;
  className?: string;
}

/** Résolution du rendu hors écran. 512 px suffit largement : cette image ne
 *  sert qu'à l'aperçu, jamais à l'export — celui-ci est refait par Rust, à la
 *  résolution demandée. */
const RENDER = 512;

/** Deux images successives laissent au navigateur le temps de peindre la
 *  scène avant qu'on la capture. Capturer plus tôt rendrait une tuile
 *  incomplète, ou vide. */
function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

const CHECKER =
  "repeating-conic-gradient(#3a3a42 0% 25%, #2c2c33 0% 50%) 50% / 20px 20px";

/** La vue qui compte : le motif RÉPÉTÉ.
 *
 *  Une tuile isolée ne dit rien de sa qualité — c'est la répétition qui révèle
 *  les coutures, les alignements involontaires et les zones vides. D'où le
 *  parti pris de la garder sous les yeux pendant l'édition plutôt que de la
 *  reléguer derrière un bouton d'aperçu.
 *
 *  La mécanique : la tuile est rendue une fois hors écran par le MÊME composant
 *  que le canevas d'édition — donc avec les mêmes neuf copies — puis répétée
 *  par le navigateur en fond de bloc. Répéter une image déjà tuilable coûte
 *  zéro, là où neuf scènes Konva coûteraient neuf fois le travail. */
export function RepeatPreview({
  pattern,
  images,
  cell,
  checker = true,
  className = "",
}: Props) {
  const stageRef = useRef<Konva.Stage | null>(null);
  const [url, setUrl] = useState<string | null>(null);

  // La tuile est recapturée dès que le motif change. Les dépendances portent
  // sur le CONTENU, pas sur l'objet : une nouvelle référence à chaque frappe
  // relancerait une capture pour rien.
  const clef = JSON.stringify(pattern);
  const prets = [...images.keys()].sort().join("|");

  // `clef` et `prets` ne sont pas LUS dans l'effet, mais ils doivent le
  // déclencher : la capture relit la scène par une `ref`, et sans ces deux
  // signaux l'aperçu resterait figé sur la première tuile rendue.
  // biome-ignore lint/correctness/useExhaustiveDependencies: signaux de changement du motif et des pixels chargés
  useEffect(() => {
    let vivant = true;
    (async () => {
      await nextPaint();
      if (!vivant) return;
      try {
        setUrl(stageRef.current?.toDataURL({ pixelRatio: 1 }) ?? null);
      } catch {
        /* une pièce illisible : l'aperçu garde l'image précédente */
      }
    })();
    return () => {
      vivant = false;
    };
  }, [clef, prets]);

  const ratio = pattern.tile.height / pattern.tile.width;

  return (
    <div
      className={`relative overflow-hidden rounded-xl ${className}`}
      style={{ background: checker ? CHECKER : undefined }}
    >
      {url && (
        <div
          className="absolute inset-0"
          style={{
            backgroundImage: `url(${url})`,
            backgroundSize: `${cell}px ${cell * ratio}px`,
            backgroundRepeat: "repeat",
            // le motif part du coin : sans ça, un redimensionnement de la
            // fenêtre déplacerait la phase et donnerait l'illusion que le
            // motif bouge tout seul
            backgroundPosition: "0 0",
          }}
        />
      )}

      {/* Scène de capture : hors écran, à résolution fixe. C'est le même
          composant qu'à l'édition, donc ce qui est répété ici est exactement ce
          qui sera exporté, à la résolution près. */}
      <div
        aria-hidden
        className="pointer-events-none fixed opacity-0"
        style={{ left: -99999, top: 0 }}
      >
        <PatternStage
          ref={stageRef}
          pattern={pattern}
          images={images}
          scale={RENDER / pattern.tile.width}
        />
      </div>
    </div>
  );
}
