/** Terracotta, teal and sand accents for the Palm Store look; a category always gets the same one. */
export const ACCENTS = [
  { solid: "#C4553A", soft: "#F8E1D8", text: "#A8452E" },
  { solid: "#006D77", soft: "#DCEDEC", text: "#00565E" },
  { solid: "#F4A261", soft: "#FCEBD9", text: "#9A4A1C" },
  { solid: "#8B5E3C", soft: "#F1E4D4", text: "#6B4529" },
  { solid: "#2E1E16", soft: "#EDE3D8", text: "#2E1E16" },
  { solid: "#D98E6E", soft: "#F9E6DC", text: "#93452B" },
];

export function accentFor(key: string | number | null | undefined) {
  if (key === null || key === undefined || key === "") return { solid: "#7A6556", soft: "#EFE5DA", text: "#5C4A3E" };
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
