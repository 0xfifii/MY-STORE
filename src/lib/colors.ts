/** Palmspring orange, charcoal and grey accents for the Palm Store look; a category always gets the same one. */
export const ACCENTS = [
  { solid: "#C65A29", soft: "#FBE6DA", text: "#A84A20" },
  { solid: "#2B2B2B", soft: "#EFEDEB", text: "#2B2B2B" },
  { solid: "#E89A6C", soft: "#FCEEE5", text: "#9A4A1C" },
  { solid: "#989898", soft: "#F2F2F2", text: "#555555" },
  { solid: "#7F3615", soft: "#F6E2D7", text: "#7F3615" },
  { solid: "#D4A27F", soft: "#F8EDE4", text: "#8A5A36" },
];

export function accentFor(key: string | number | null | undefined) {
  if (key === null || key === undefined || key === "") return { solid: "#8F8F8F", soft: "#F2F2F2", text: "#555555" };
  const s = String(key);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return ACCENTS[h % ACCENTS.length];
}

export function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase();
}
