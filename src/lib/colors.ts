/** Teal and orange accents for the Palm Store look; a category always gets the same one. */
export const ACCENTS = [
  { solid: "#006D77", soft: "#DDEFF0", text: "#00565E" },
  { solid: "#F4A261", soft: "#FDEEDF", text: "#9A4A1C" },
  { solid: "#83C5BE", soft: "#E3F2F1", text: "#1F5F5A" },
  { solid: "#E76F51", soft: "#FCE6DF", text: "#A33B22" },
  { solid: "#0F2A2E", soft: "#E1EAEB", text: "#0F2A2E" },
  { solid: "#3A9AA3", soft: "#E0F1F2", text: "#145960" },
];

export function accentFor(key: string | number | null | undefined) {
  if (key === null || key === undefined || key === "") return { solid: "#557074", soft: "#E8F0F1", text: "#3D5559" };
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
