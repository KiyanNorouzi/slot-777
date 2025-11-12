import { useEffect, useRef } from "react";
import { Application, Sprite, Assets, Texture, Container } from "pixi.js";

import sevenUrl from "../assets/symbols/seven.svg";
import barUrl   from "../assets/symbols/bar.svg";
import bellUrl  from "../assets/symbols/bell.svg";
import cherryUrl from "../assets/symbols/cherry.svg";
import lemonUrl  from "../assets/symbols/lemon.svg";
import frameUrl  from "../assets/ui/frame.svg";

const BASE_W = 800, BASE_H = 450;

export default function PixiStage({
  spinning,
  symbols,
}: {
  spinning?: boolean;
  symbols?: string[];
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const st = useRef<{ spinning: boolean; symbols?: string[] }>({
    spinning: false,
  });
  useEffect(() => {
    st.current = { spinning: !!spinning, symbols };
  }, [spinning, symbols]);

  useEffect(() => {
    let destroyed = false;
    (async () => {
      const el = hostRef.current!;
      const app = new Application();
    
      await (app as any).init?.({
        antialias: true,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        backgroundColor: 0x111111,
      });
     
      const canvas: HTMLCanvasElement =
        (app as any).view || (app as any).canvas;
      el.appendChild(canvas);

      // Root container to center/scale the scene
      const game = new Container();
    
      (app as any).stage.addChild(game);

      // Load textures (symbols + frame)
      const urls = {
        Seven: sevenUrl,
        Bar: barUrl,
        Bell: bellUrl,
        Cherry: cherryUrl,
        Lemon: lemonUrl,
      } as const;
      const tex: Record<string, Texture> = {};
      await Promise.all(
        Object.entries(urls).map(async ([k, u]) => {
          tex[k] = (await Assets.load(u)) as Texture;
        })
      );
      const frameTex = (await Assets.load(frameUrl)) as Texture;

      // Frame (centered)
      const frame = new Sprite(frameTex);
      frame.anchor.set(0.5);
      frame.position.set(0, 0);
      game.addChild(frame);

      // Reels
      const names = Object.keys(urls) as (keyof typeof urls)[];
      const R = [-180, 0, 180].map((x) => {
        const sp = new Sprite(tex.Seven);
        sp.anchor.set(0.5);
        sp.position.set(x, 0);
        sp.scale.set(1.2);
        game.addChild(sp);
        return sp;
      });

      // Simple sequential stop state
      let locked = [false, false, false];
      let stopIndex = 0;
      let stopTimer = 0;
      const STOP_DELAY_FRAMES = 12;

      const resize = () => {
        const w = el.clientWidth || window.innerWidth;
        const h = el.clientHeight || window.innerHeight;

        (app as any).renderer?.resize(w, h);
        const s = Math.min(w / BASE_W, h / BASE_H);
        game.scale.set(s);
        game.position.set(w / 2, h / 2);
      };
      resize();
      window.addEventListener("resize", resize);


      (app as any).ticker.maxFPS = 60;

      (app as any).ticker.add(() => {
        const cur = st.current;
        if (cur.spinning) {
          // Reset locking each spin
          if (locked.some(Boolean)) {
            locked = [false, false, false];
            stopIndex = 0;
            stopTimer = 0;
          }
          // Spin all unlocked reels (fake motion)
          for (let i = 0; i < 3; i++) {
            if (!locked[i]) {
              const n = names[(Math.random() * names.length) | 0] as string;
              R[i].texture = tex[n];
            }
          }
        } else if (cur.symbols && stopIndex < 3) {
          // When spin ends, stop reels one-by-one with a small delay
          stopTimer++;
          if (stopTimer >= STOP_DELAY_FRAMES) {
            const sym = (cur.symbols[stopIndex] || "Lemon") as keyof typeof urls;
            R[stopIndex].texture = tex[sym];
            locked[stopIndex] = true;
            stopIndex++;
            stopTimer = 0;
          }
        } else if (cur.symbols && stopIndex >= 3) {
          // Ensure final symbols are shown
          for (let i = 0; i < 3; i++) {
            const sym = (cur.symbols[i] || "Lemon") as keyof typeof urls;
            if (R[i].texture !== tex[sym]) R[i].texture = tex[sym];
          }
        }
      });

      if (destroyed) try { (app as any).destroy?.(true); } catch {}
    })();

    return () => {
      destroyed = true;
      const el = hostRef.current;
      if (el) el.innerHTML = "";
    };
  }, []);

  return <div ref={hostRef} style={{ position: "fixed", inset: 0 }} />;
}
