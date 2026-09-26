"use client";

import { useEffect, useRef } from "react";

type Props = {
  talking: boolean;
  size: "hero" | "dock" | "mini";
  status?: "online" | "thinking";
};

/** Clay avatar: an idle loop and a talking loop, crossfaded while the reply is being "spoken". */
export default function Avatar({ talking, size, status = "online" }: Props) {
  const idleRef = useRef<HTMLVideoElement>(null);
  const talkRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
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
  }, [talking]);

  return (
    <div className={`avatar avatar--${size}${talking ? " is-talking" : ""}`} aria-hidden="true">
      <div className="avatar__frame">
        <video ref={idleRef} className="avatar__video" src="/avatar/idle.mp4" poster="/avatar/portrait.webp" muted loop playsInline preload="auto" />
        <video ref={talkRef} className="avatar__video avatar__video--talk" src="/avatar/talking.mp4" poster="/avatar/portrait-open.webp" muted loop playsInline preload="auto" />
      </div>
      <span className={`avatar__presence avatar__presence--${status}`} />
    </div>
  );
}
