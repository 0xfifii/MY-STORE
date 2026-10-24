/** Greyscale accents for the black-and-white ÌṢÚRA look; a category always gets the same one. */
export const ACCENTS = [
  { solid: "#111111", soft: "#efefef", text: "#111111" },
  { solid: "#4a4a4a", soft: "#f0f0f0", text: "#2b2b2b" },
  { solid: "#7a7a7a", soft: "#f2f2f2", text: "#3d3d3d" },
  { solid: "#a3a3a3", soft: "#f3f3f3", text: "#4a4a4a" },
  { solid: "#2b2b2b", soft: "#ededed", text: "#1a1a1a" },
  { solid: "#c4c4c4", soft: "#f5f5f5", text: "#555555" },
];

export function accentFor(key: string | number | null | undefined) {
  if (key === null || key === undefined || key === "") return { solid: "#6b6b6b", soft: "#f1f1f1", text: "#555555" };
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
