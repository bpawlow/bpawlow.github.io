import type { ReactElement } from "react";

const HEART_COUNT = 12;

export default function HeartsBackground(): ReactElement {
  return (
    <div className="hearts-layer" aria-hidden="true">
      {Array.from({ length: HEART_COUNT }, (_, index) => (
        <span className="heart" key={`heart-${index}`}>
          ❤
        </span>
      ))}
    </div>
  );
}
