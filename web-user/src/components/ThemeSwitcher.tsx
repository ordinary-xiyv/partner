import React from "react";
import { useTheme } from "../contexts/ThemeContext";

type ThemeMode = "light" | "dark" | "system";

const options: { mode: ThemeMode; icon: string; label: string }[] = [
  { mode: "light", icon: "☀️", label: "Light" },
  { mode: "dark", icon: "🌙", label: "Dark" },
  { mode: "system", icon: "💻", label: "System" },
];

export default function ThemeSwitcher() {
  const { mode, setMode } = useTheme();
  return (
    <div style={{
      display: "flex", gap: 2,
      background: "var(--border-default)",
      borderRadius: 8, padding: 2,
    }}>
      {options.map((o) => (
        <button key={o.mode} onClick={() => setMode(o.mode)}
          title={o.label}
          style={{
            background: mode === o.mode ? "var(--bg-card)" : "transparent",
            border: "none", cursor: "pointer",
            padding: "4px 8px", borderRadius: 6,
            fontSize: 14, transition: "all 0.15s",
            color: mode === o.mode ? "var(--text-primary)" : "var(--text-tertiary)",
          }}>
          {o.icon}
        </button>
      ))}
    </div>
  );
}
