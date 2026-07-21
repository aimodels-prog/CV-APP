const clean = (value: unknown): string => String(value ?? "").trim();

export function normalizeExpertType(value: unknown): "Internal" | "External" {
  const candidate = clean(value).toLowerCase();
  if (/\binternal\b|permanent\s+staff|employee/.test(candidate)) return "Internal";
  return "External";
}

export function normalizeEducationLevel(value: unknown): string {
  const candidate = clean(value);
  if (!candidate) return "";

  const normalized = candidate.toLowerCase().replace(/[.'’]/g, "");
  if (/\b(ph\s*d|doctor of philosophy)\b/.test(normalized)) return "PhD";
  if (/\bdoctor(?:ate|al degree)\b/.test(normalized)) return "Doctorate";
  if (/\b(masters?|msc|meng|mtech|mba)\b/.test(normalized)) return "Master Degree";
  if (/\bpostgraduate\s+diploma\b/.test(normalized)) return "Postgraduate Diploma";
  if (/\b(higher national diploma|hnd)\b/.test(normalized)) return "Higher National Diploma";
  if (/\b(bachelors?|bsc|beng|btech|bba|bcom|mbbs)\b/.test(normalized)) return "Bachelor Degree";
  if (/\bassociate\b/.test(normalized)) return "Associate Degree";
  if (/\bdiploma\b/.test(normalized)) return "Diploma";
  if (/\bcertificate\b/.test(normalized)) return "Certificate";
  if (/\b(secondary|high school)\b/.test(normalized)) return "Secondary Education";
  return "";
}

export function splitCommaSeparated(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map(clean).filter(Boolean);
  }
  if (typeof value !== "string") return [];
  return value.split(/[,;]/).map(clean).filter(Boolean);
}
