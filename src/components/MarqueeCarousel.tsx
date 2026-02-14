import type { CSSProperties, ReactElement } from "react";

export const CAROUSEL_SPEED_SECONDS = 18;

type MarqueeCarouselProps = {
  images: string[];
};

export default function MarqueeCarousel({
  images
}: MarqueeCarouselProps): ReactElement {
  if (images.length === 0) {
    return (
      <div className="carousel-fallback" role="status" aria-live="polite">
        Add photos to <code>src/assets/carousel/</code> to start the love train.
      </div>
    );
  }

  const loopImages: string[] = [...images, ...images];

  return (
    <div className="marquee-shell" aria-label="Auto-scrolling photo carousel">
      <div
        className="marquee-track"
        style={
          {
            "--marquee-duration": `${CAROUSEL_SPEED_SECONDS}s`
          } as CSSProperties
        }
      >
        {loopImages.map((src, index) => (
          <figure className="marquee-item" key={`${src}-${index}`}>
            <img
              src={src}
              alt={`Valentine memory ${index % images.length + 1}`}
              loading="lazy"
            />
          </figure>
        ))}
      </div>
    </div>
  );
}
