export interface CertificationSettings {
  show: boolean;
  expertSignatureBase64?: string;
  expertSignatureDate?: string;
  repName?: string;
  repSignatureBase64?: string;
  repSignatureDate?: string;
}

export interface TenderRepresentativeSettings {
  repName: string;
  repSignatureBase64?: string;
  repSignatureDate: string;
}

export function resolveCertificationSettings(
  cvSettings: Partial<CertificationSettings> | undefined,
  tender: any,
): CertificationSettings | undefined {
  const tenderSettings = tender?.representativeSignatureSettings as
    | TenderRepresentativeSettings
    | undefined;

  if (!cvSettings && !tenderSettings) return undefined;

  return {
    show: cvSettings?.show !== false,
    expertSignatureBase64: cvSettings?.expertSignatureBase64,
    expertSignatureDate: cvSettings?.expertSignatureDate,
    repName: cvSettings?.repName || tenderSettings?.repName || "",
    repSignatureBase64:
      cvSettings?.repSignatureBase64 ||
      tenderSettings?.repSignatureBase64 ||
      "",
    repSignatureDate:
      cvSettings?.repSignatureDate ||
      tenderSettings?.repSignatureDate ||
      "",
  };
}
