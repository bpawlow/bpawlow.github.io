import { useCallback, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactElement } from "react";

export const CAROUSEL_SPEED_SECONDS = 40;

const carouselModules = import.meta.glob<string>(
  "../assets/carousel/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default" },
);

function sortByFileName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export default function MarqueeCarousel(): ReactElement {
  const [allImagesLoaded, setAllImagesLoaded] = useState(false);
  const loadedUrlsRef = useRef<Set<string>>(new Set());

  const images = useMemo(
    () => (Object.values(carouselModules) as string[]).sort(sortByFileName),
    [],
  );

  const handleImageLoad = useCallback(
    (src: string) => {
      loadedUrlsRef.current.add(src);
      if (loadedUrlsRef.current.size >= images.length) {
        setAllImagesLoaded(true);
      }
    },
    [images.length],
  );

  if (images.length === 0) {
    return (
      <div className="carousel-fallback" role="status" aria-live="polite">
        Add photos to <code>src/assets/carousel/</code> to start the love train.
      </div>
    );
  }

  const loopImages: string[] = [...images, ...images];

  return (
    <>
      {!allImagesLoaded && (
        <div className="carousel-loading" role="status" aria-live="polite" aria-label="Loading photos">
          <div className="carousel-loading-spinner" />
          <span>Loading memories...</span>
        </div>
      )}
      <div
        className="marquee-shell"
        aria-label="Auto-scrolling photo carousel"
        aria-hidden={!allImagesLoaded}
        style={{
          opacity: allImagesLoaded ? 1 : 0,
          visibility: allImagesLoaded ? "visible" : "hidden",
          transition: "opacity 0.25s ease",
        }}
      >
        <div
          className="marquee-track"
          style={
            {
              "--marquee-duration": `${CAROUSEL_SPEED_SECONDS}s`,
            } as CSSProperties
          }
        >
          {loopImages.map((src, index) => (
            <figure className="marquee-item" key={`${src}-${index}`}>
              <img
                src={src}
                alt={`Valentine memory ${index % images.length + 1}`}
                width={120}
                height={120}
                loading="eager"
                decoding="async"
                onLoad={() => handleImageLoad(src)}
              />
            </figure>
          ))}
        </div>
      </div>
    </>
  );
}
