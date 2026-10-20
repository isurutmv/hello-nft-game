// Registers the design's components and exposes them to React.
import { useEffect, useRef, type CSSProperties } from "react";
import { mount, registerComponent, type Mounted } from "./runtime";
import assets from "./assets.json";
import SeriesCard from "./components/SeriesCard.dc.html?raw";
import ImpactCard from "./components/ImpactCard.dc.html?raw";
import KeyCard from "./components/KeyCard.dc.html?raw";
import AdventureCard from "./components/AdventureCard.dc.html?raw";
import LevelCard from "./components/LevelCard.dc.html?raw";
import EnemyCard from "./components/EnemyCard.dc.html?raw";
import CardBack from "./components/CardBack.dc.html?raw";
import PackWrapper from "./components/PackWrapper.dc.html?raw";
import PackFront from "./components/PackFront.dc.html?raw";
import CardFace from "./components/CardFace.dc.html?raw";
import PackRipLive from "./components/PackRipLive.dc.html?raw";

const ASSETS = assets as Record<string, string>;
/** Design files reference images as /_blob/<hash>; serve them from /art. */
export const assetUrl = (blobPath: string) => ASSETS[blobPath.split("/").pop()!] ?? blobPath;

let ready = false;
export function registerDesign() {
  if (ready) return;
  ready = true;
  const sources: Record<string, string> = {
    SeriesCard,
    ImpactCard,
    KeyCard,
    AdventureCard,
    LevelCard,
    EnemyCard,
    CardBack,
    PackWrapper,
    PackFront,
    CardFace,
    PackRipLive,
  };
  for (const [name, src] of Object.entries(sources)) registerComponent(name, src, assetUrl);
}

/** Size of each design component's artboard (from its hint-size). */
export const SIZES: Record<string, [number, number]> = {
  CardFace: [360, 504],
  CardBack: [360, 504],
  PackWrapper: [360, 560],
  PackFront: [1100, 760],
  PackRipLive: [1280, 920],
};

/**
 * Renders a design component at `width` px wide, scaled from its native artboard, inside a
 * shadow root so its CSS stays exactly as designed.
 */
export function DcView({ name, props, width, style, className }: { name: string; props: Record<string, unknown>; width?: number; style?: CSSProperties; className?: string }) {
  const host = useRef<HTMLDivElement>(null);
  const inst = useRef<Mounted | null>(null);
  const [w, h] = SIZES[name] ?? [360, 504];
  const scale = width ? width / w : 1;
  const key = JSON.stringify(props);

  useEffect(() => {
    registerDesign();
    inst.current = mount(host.current!, name, props);
    return () => {
      inst.current?.destroy();
      inst.current = null;
    };
    // mount once per component name; prop changes go through update()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);
  useEffect(() => {
    inst.current?.update(props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className={className} style={{ width: w * scale, height: h * scale, position: "relative", ...style }}>
      <div ref={host} style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: "0 0", position: "absolute", left: 0, top: 0 }} />
    </div>
  );
}
