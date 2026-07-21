export interface CertificationSettings {
  show: boolean;
  expertSignatureBase64?: string;
  expertSignatureDate?: string;
  repName?: string;
  repSignatureBase64?: string;
  repSignatureDate?: string;
}

export function getCertificationHtml(expertName: string, settings?: CertificationSettings): string {
  if (settings && settings.show === false) return '';
  const formatDate = (value?: string) => {
    if (!value) return new Date().toLocaleDateString('en-GB');
    const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return isoDate ? `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}` : value;
  };
  const expertDate = formatDate(settings?.expertSignatureDate);
  const repDate = formatDate(settings?.repSignatureDate);
  const repName = settings?.repName || "";
  
  return `
    <div style="margin-top: 40px; page-break-inside: avoid; font-family: Arial, sans-serif;">
      <h3 style="font-size: 1.1em; margin-bottom: 10px;">CERTIFICATION:</h3>
      <p style="font-size: 0.9em; line-height: 1.5; margin-bottom: 20px;">
        I, the undersigned, certify that to the best of my knowledge and belief, this CV correctly describes myself, my qualifications, and my experience, and I am available to undertake the assignment in case of an award. I understand that any misstatement or misrepresentation described herein may lead to my disqualification or dismissal by the Client, and/or sanctions by the Bank.
      </p>
      <table style="width: 100%; border-collapse: collapse; font-size: 0.9em; table-layout: fixed;">
        <tbody>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 10px; width: 40%; vertical-align: middle;">${expertName}</td>
            <td style="border: 1px solid #cbd5e1; padding: 10px; width: 40%; text-align: center; vertical-align: middle; height: 50px;">
              ${settings?.expertSignatureBase64 ? `<img src="${settings.expertSignatureBase64}" style="max-height: 40px; max-width: 100%;" />` : ''}
            </td>
            <td style="border: 1px solid #cbd5e1; padding: 10px; width: 20%; vertical-align: middle;">${expertDate}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 0.8em; color: #64748b;">Name of Expert</td>
            <td style="border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 0.8em; color: #64748b; text-align: center;">Signature</td>
            <td style="border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 0.8em; color: #64748b;">Date</td>
          </tr>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 10px; vertical-align: middle;">${repName}</td>
            <td style="border: 1px solid #cbd5e1; padding: 10px; text-align: center; vertical-align: middle; height: 50px;">
              ${settings?.repSignatureBase64 ? `<img src="${settings.repSignatureBase64}" style="max-height: 40px; max-width: 100%;" />` : ''}
            </td>
            <td style="border: 1px solid #cbd5e1; padding: 10px; vertical-align: middle;">${repDate}</td>
          </tr>
          <tr>
            <td style="border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 0.8em; color: #64748b;">Name of authorized representative of the Consultant</td>
            <td style="border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 0.8em; color: #64748b; text-align: center;">Signature</td>
            <td style="border: 1px solid #cbd5e1; padding: 5px 10px; font-size: 0.8em; color: #64748b;">Date</td>
          </tr>
        </tbody>
      </table>
    </div>
  `;
}
