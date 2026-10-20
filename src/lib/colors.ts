/** Accent colours that sit with burgundy; a category always gets the same one. */
export const ACCENTS = [
  { solid: "#9c2a45", soft: "#f6e3e8", text: "#7a1f35" },
  { solid: "#2a78d6", soft: "#e8f1fc", text: "#1c5cab" },
  { solid: "#d99a00", soft: "#fff4d6", text: "#8a5a00" },
  { solid: "#1baf7a", soft: "#e3f6ee", text: "#11714f" },
  { solid: "#6250d6", soft: "#eeebfc", text: "#4a3aa7" },
  { solid: "#eb6834", soft: "#fdede5", text: "#a8431b" },
];

export function accentFor(key: string | number | null | undefined) {
  if (key === null || key === undefined || key === "") return { solid: "#77696d", soft: "#f1ecec", text: "#5c5053" };
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
