import { useEffect, useState } from "react";
import { UI } from "../i18n-ui";

const SHOW_AFTER_PX = 320;

function isNearBottom(threshold = 320): boolean {
  const { scrollY, innerHeight } = window;
  const maxScroll = document.documentElement.scrollHeight - innerHeight;
  return maxScroll - scrollY <= threshold;
}

export function ScrollToTop() {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setShowTop(window.scrollY > SHOW_AFTER_PX);
      setShowBottom(!isNearBottom(SHOW_AFTER_PX));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <div className="scroll-nav" aria-hidden={!showTop && !showBottom}>
      <button
        type="button"
        className={`scroll-nav-btn scroll-nav-btn--top${showTop ? " scroll-nav-btn--visible" : ""}`}
        aria-label={UI.scrollToTop}
        title={UI.scrollToTop}
        onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      >
        <span aria-hidden>↑</span>
      </button>
      <button
        type="button"
        className={`scroll-nav-btn scroll-nav-btn--bottom${showBottom ? " scroll-nav-btn--visible" : ""}`}
        aria-label={UI.scrollToBottom}
        title={UI.scrollToBottom}
        onClick={() =>
          window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: "smooth",
          })
        }
      >
        <span aria-hidden>↓</span>
      </button>
    </div>
  );
}
