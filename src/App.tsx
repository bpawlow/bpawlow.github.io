import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  MouseEvent,
  ReactElement,
  TouchEvent,
} from "react";
import HeartsBackground from "./components/HeartsBackground";
import heroImage from "./assets/me.jpeg";

const MarqueeCarousel = lazy(() => import("./components/MarqueeCarousel"));
import "./App.css";

// Preload hero image so the browser fetches it as soon as the app runs (industry standard for LCP).
function useHeroPreload(src: string): void {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;
    document.head.appendChild(link);
    return () => link.remove();
  }, [src]);
}

type Stage = "question" | "yes";
type Position = { x: number; y: number };

const DODGE_EDGE_PADDING = 16;
const TOUCH_OFFSET = 64;
const YES_TOUCH_ZONE_PADDING = 20;
const MESSAGES: string[] = [
  "Do you want to be my valentine? 💘",
  "Are you sure?",
  "Really sure?",
  "Think again 😭",
  "Ok but like... yes?",
  "Last chance to choose wisely!",
  "Ok now I feel real hurt 😭",
];


export default function App(): ReactElement {
  const [stage, setStage] = useState<Stage>("question");
  const [noAttempts, setNoAttempts] = useState<number>(0);
  const [noPos, setNoPos] = useState<Position>({ x: 0, y: 0 });
  const [heroImageLoaded, setHeroImageLoaded] = useState(false);

  useHeroPreload(heroImage);

  const cardRef = useRef<HTMLDivElement>(null);
  const buttonZoneRef = useRef<HTMLDivElement>(null);
  const yesBtnRef = useRef<HTMLButtonElement>(null);
  const noBtnRef = useRef<HTMLButtonElement>(null);

  const messageIndex = Math.min(noAttempts, MESSAGES.length - 1);
  const promptText = MESSAGES[messageIndex];
  const yesScale = 1 + Math.min(noAttempts * 0.1, 0.4);

  const moveNoButton = (
    event?: MouseEvent<HTMLButtonElement> | TouchEvent<HTMLButtonElement>,
  ): void => {
    const noButton = noBtnRef.current;
    const yesButton = yesBtnRef.current;
    if (!noButton) {
      return;
    }

    const btnRect = noButton.getBoundingClientRect();
    const btnW = btnRect.width;
    const btnH = btnRect.height;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const maxX = Math.max(DODGE_EDGE_PADDING, vw - btnW - DODGE_EDGE_PADDING);
    const maxY = Math.max(DODGE_EDGE_PADDING, vh - btnH - DODGE_EDGE_PADDING);

    let yesExcludeLeft = -9999;
    let yesExcludeTop = -9999;
    let yesExcludeRight = 9999;
    let yesExcludeBottom = 9999;
    if (yesButton) {
      const yesRect = yesButton.getBoundingClientRect();
      yesExcludeLeft = yesRect.left - YES_TOUCH_ZONE_PADDING;
      yesExcludeTop = yesRect.top - YES_TOUCH_ZONE_PADDING;
      yesExcludeRight = yesRect.right + YES_TOUCH_ZONE_PADDING;
      yesExcludeBottom = yesRect.bottom + YES_TOUCH_ZONE_PADDING;
    }

    type Region = { minX: number; maxX: number; minY: number; maxY: number };
    const regions: Region[] = [];

    if (yesExcludeTop - btnH > DODGE_EDGE_PADDING) {
      regions.push({
        minX: DODGE_EDGE_PADDING,
        maxX,
        minY: DODGE_EDGE_PADDING,
        maxY: yesExcludeTop - btnH - DODGE_EDGE_PADDING,
      });
    }
    if (yesExcludeBottom + DODGE_EDGE_PADDING < maxY) {
      regions.push({
        minX: DODGE_EDGE_PADDING,
        maxX,
        minY: yesExcludeBottom + DODGE_EDGE_PADDING,
        maxY,
      });
    }
    if (yesExcludeLeft - btnW > DODGE_EDGE_PADDING) {
      regions.push({
        minX: DODGE_EDGE_PADDING,
        maxX: yesExcludeLeft - btnW - DODGE_EDGE_PADDING,
        minY: DODGE_EDGE_PADDING,
        maxY,
      });
    }
    if (yesExcludeRight + DODGE_EDGE_PADDING < maxX) {
      regions.push({
        minX: yesExcludeRight + DODGE_EDGE_PADDING,
        maxX,
        minY: DODGE_EDGE_PADDING,
        maxY,
      });
    }

    const validRegions = regions.filter(
      (r) => r.maxX > r.minX && r.maxY > r.minY,
    );

    let x: number;
    let y: number;

    if (validRegions.length === 0) {
      x = DODGE_EDGE_PADDING + Math.random() * (maxX - DODGE_EDGE_PADDING);
      y = DODGE_EDGE_PADDING + Math.random() * (maxY - DODGE_EDGE_PADDING);
    } else {
      const region =
        validRegions[Math.floor(Math.random() * validRegions.length)];
      const rangeX = Math.max(1, region.maxX - region.minX);
      const rangeY = Math.max(1, region.maxY - region.minY);
      x = region.minX + Math.random() * rangeX;
      y = region.minY + Math.random() * rangeY;
    }

    if (event && "touches" in event && event.touches.length > 0) {
      const touch = event.touches[0];
      const touchX = touch.clientX;
      const touchY = touch.clientY;
      const nearFinger =
        Math.abs(x + btnW / 2 - touchX) < TOUCH_OFFSET &&
        Math.abs(y + btnH / 2 - touchY) < TOUCH_OFFSET;

      if (nearFinger && validRegions.length > 0) {
        const awayFromFinger = validRegions.filter((r) => {
          const cx = (r.minX + r.maxX) / 2;
          const cy = (r.minY + r.maxY) / 2;
          return (
            Math.abs(cx - touchX) > TOUCH_OFFSET ||
            Math.abs(cy - touchY) > TOUCH_OFFSET
          );
        });
        const regionsToPick =
          awayFromFinger.length > 0 ? awayFromFinger : validRegions;
        const chosen =
          regionsToPick[Math.floor(Math.random() * regionsToPick.length)];
        const rangeX = Math.max(1, chosen.maxX - chosen.minX);
        const rangeY = Math.max(1, chosen.maxY - chosen.minY);
        x = chosen.minX + Math.random() * rangeX;
        y = chosen.minY + Math.random() * rangeY;
      }
    }

    setNoPos({ x, y });
    setNoAttempts((attempts) => attempts + 1);
  };

  const handleBackToQuestion = (): void => {
    setStage("question");
    setNoAttempts(0);
    setNoPos({ x: 0, y: 0 });
  };

  return (
    <main className="app">
      <HeartsBackground />

      {!heroImageLoaded && (
        <div className="app-loader" role="status" aria-live="polite" aria-label="Loading">
          <div className="app-loader-spinner" />
          <span className="app-loader-text">Loading...</span>
        </div>
      )}

      <section
        className="card"
        ref={cardRef}
        aria-hidden={!heroImageLoaded}
        style={{ opacity: heroImageLoaded ? 1 : 0, transition: "opacity 0.2s ease" }}
      >
        {stage === "question" ? (
          <>
            <img
              className="hero-photo"
              src={heroImage}
              alt="me"
              width={180}
              height={180}
              fetchPriority="high"
              decoding="async"
              onLoad={() => setHeroImageLoaded(true)}
              onError={() => setHeroImageLoaded(true)}
            />
            <h1 style={{ fontSize: "2rem" }}>{promptText}</h1>

            <div className="button-zone" ref={buttonZoneRef}>
              <button
                ref={yesBtnRef}
                className="btn btn-yes"
                type="button"
                aria-label="Yes, I want to be your valentine"
                onClick={() => setStage("yes")}
                style={{ "--yes-scale": yesScale } as CSSProperties}
              >
                Yes
              </button>

              {noAttempts === 0 ? (
                <button
                  className="btn btn-no btn-no-inline"
                  type="button"
                  aria-label="No, I do not want to be your valentine"
                  ref={noBtnRef}
                  onMouseEnter={moveNoButton}
                  onTouchStart={moveNoButton}
                  onClick={moveNoButton}
                >
                  No
                </button>
              ) : null}
            </div>
          </>
        ) : (
          <div className="success-screen">
            <h1 className="success-title">yayy!!!</h1>
            <Suspense fallback={<div className="carousel-fallback">Loading memories...</div>}>
              <MarqueeCarousel />
            </Suspense>
            <p
              className="success-line"
              style={{ fontSize: "1.5rem", marginTop: "1rem" }}
            >
              Correct answer 😌💘
            </p>
            <button
              className="btn btn-back"
              type="button"
              aria-label="Ask the question again"
              onClick={handleBackToQuestion}
            >
              Want me to ask the question again?
            </button>
          </div>
        )}
      </section>

      {stage === "question" && noAttempts > 0 ? (
        <button
          className="btn btn-no btn-no-fixed"
          type="button"
          aria-label="No, I do not want to be your valentine"
          ref={noBtnRef}
          onMouseEnter={moveNoButton}
          onTouchStart={moveNoButton}
          onClick={moveNoButton}
          style={{
            left: `${noPos.x}px`,
            top: `${noPos.y}px`,
          }}
        >
          No
        </button>
      ) : null}
    </main>
  );
}
