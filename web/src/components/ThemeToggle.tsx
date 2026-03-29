import { useState } from "react";
import { UI } from "../i18n-ui";
import { getPreference, setPreference, type ThemePreference } from "../theme";

const ORDER: ThemePreference[] = ["system", "light", "dark"];

export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePreference>(() => getPreference());

  const cycle = () => {
    const i = ORDER.indexOf(pref);
    const next = ORDER[(i + 1) % ORDER.length]!;
    setPreference(next);
    setPref(next);
  };

  const label = pref === "system" ? UI.themeSystem : pref === "light" ? UI.themeLight : UI.themeDark;
  const icon = pref === "system" ? "◐" : pref === "light" ? "☀" : "☾";

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={cycle}
      title={`${UI.themeCycleAria}：${label}`}
      aria-label={`${UI.themeCycleAria}，当前：${label}`}
    >
      <span className="theme-toggle__icon" aria-hidden>
        {icon}
      </span>
      <span className="theme-toggle__text">{label}</span>
    </button>
  );
}
