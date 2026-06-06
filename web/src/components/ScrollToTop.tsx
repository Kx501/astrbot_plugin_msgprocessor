import { useEffect, useState } from "react";
import { UI } from "../i18n-ui";

const SHOW_AFTER_PX = 320;

export function ScrollToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      className={`scroll-to-top${visible ? " scroll-to-top--visible" : ""}`}
      aria-label={UI.scrollToTop}
      title={UI.scrollToTop}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
    >
      <span aria-hidden>↑</span>
    </button>
  );
}
