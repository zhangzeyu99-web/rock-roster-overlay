import { useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

type OutputAlign = "center" | "start" | "end";

interface OutputViewportProps {
  width: number;
  height: number;
  children: ReactNode;
  align?: OutputAlign;
  className?: string;
  framed?: boolean;
}

export function OutputViewport({
  width,
  height,
  children,
  align = "center",
  className,
  framed = false
}: OutputViewportProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [frame, setFrame] = useState(() => ({ width, height, scale: 1 }));

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    const updateFrame = () => {
      const viewportWidth = viewport.clientWidth || viewport.offsetWidth;
      const viewportHeight = viewport.clientHeight || viewport.offsetHeight;
      const scale = Math.min(viewportWidth / width, viewportHeight / height);
      const nextScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
      setFrame({
        width: width * nextScale,
        height: height * nextScale,
        scale: nextScale
      });
    };

    updateFrame();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateFrame);
      return () => window.removeEventListener("resize", updateFrame);
    }

    const observer = new ResizeObserver(updateFrame);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [height, width]);

  return (
    <div
      className={[
        "output-viewport",
        `output-viewport-${align}`,
        framed ? "output-viewport-framed" : "",
        className ?? ""
      ].join(" ")}
      ref={viewportRef}
      style={
        {
          "--output-width": `${width}px`,
          "--output-height": `${height}px`,
          "--output-scale": String(frame.scale)
        } as CSSProperties
      }
    >
      <div
        className="output-viewport-frame"
        style={{ width: `${frame.width}px`, height: `${frame.height}px` }}
      >
        <div className="output-viewport-scale">{children}</div>
      </div>
    </div>
  );
}
