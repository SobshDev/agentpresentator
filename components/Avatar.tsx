"use client";

import { useEffect, useRef, useState } from "react";
import { site } from "@/content/site";

type Props = {
  talking: boolean;
  size: "hero" | "dock" | "mini";
  status?: "online" | "thinking";
};

/** Clay avatar: an idle loop and a talking loop, crossfaded while the reply is being "spoken". */
export default function Avatar({ talking, size, status = "online" }: Props) {
  const animated = site.avatar.animated;
  const idleRef = useRef<HTMLVideoElement>(null);
  const talkRef = useRef<HTMLVideoElement>(null);
  const [mouthOpen, setMouthOpen] = useState(false);

  // Still avatars flap between the closed and open portraits at a loose syllable rhythm.
  useEffect(() => {
    if (animated || !talking || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let timer = 0;
    const step = (open: boolean) => {
      setMouthOpen(open);
      timer = window.setTimeout(() => step(!open), open ? 140 + Math.random() * 120 : 90 + Math.random() * 160);
    };
    step(true);
    return () => {
      window.clearTimeout(timer);
      setMouthOpen(false);
    };
  }, [animated, talking]);

  useEffect(() => {
    if (!animated) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const idle = idleRef.current;
    const talk = talkRef.current;
    if (!idle || !talk || reduced) return;
    idle.play().catch(() => {});
    if (talking) {
      talk.currentTime = 0;
      talk.play().catch(() => {});
      return;
    }
    const pause = window.setTimeout(() => talk.pause(), 400);
    return () => window.clearTimeout(pause);
  }, [talking, animated]);

  return (
    <div className={`avatar avatar--${size}${(animated ? talking : mouthOpen) ? " is-talking" : ""}`} aria-hidden="true">
      <div className="avatar__frame">
        {animated ? (
          <>
            <video ref={idleRef} className="avatar__video" src="/avatar/idle.mp4" poster="/avatar/portrait.webp" muted loop playsInline preload="auto" />
            <video ref={talkRef} className="avatar__video avatar__video--talk" src="/avatar/talking.mp4" poster="/avatar/portrait-open.webp" muted loop playsInline preload="auto" />
          </>
        ) : (
          <>
            <img className="avatar__video" src="/avatar/portrait.webp" alt="" />
            <img className="avatar__video avatar__video--talk avatar__video--still" src="/avatar/portrait-open.webp" alt="" />
          </>
        )}
      </div>
      <span className={`avatar__presence avatar__presence--${status}`} />
    </div>
  );
}
