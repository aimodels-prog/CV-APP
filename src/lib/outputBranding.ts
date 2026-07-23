export interface OutputBranding {
  header_base64?: string;
  footer_base64?: string;
  [key: string]: unknown;
}

const hasBrandingImage = (branding?: OutputBranding | null) =>
  Boolean(
    branding &&
      ([branding.header_base64, branding.footer_base64].some(
        (value) => typeof value === "string" && value.trim().length > 0,
      )),
  );

/**
 * Historical CVs may contain an empty customBranding object. An empty object
 * must not hide the tender's current branding when the document is rebuilt.
 */
export const resolveOutputBranding = (
  customBranding?: OutputBranding | null,
  tenderBranding?: OutputBranding | null,
) => {
  // A linked per-CV profile is an intentional override. Older generated CVs
  // only contain an unlinked image snapshot; that stale snapshot must not hide
  // the tender's current branding profile after it has been edited.
  if (customBranding?.profile_id && hasBrandingImage(customBranding)) {
    return customBranding;
  }
  if (hasBrandingImage(tenderBranding)) return tenderBranding;
  if (hasBrandingImage(customBranding)) return customBranding;
  return undefined;
};
