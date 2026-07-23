import html2pdf from 'html2pdf.js';
import {
  DOCUMENT_BRANDING_HEIGHT_MM,
  DOCUMENT_CONTENT_WIDTH_MM,
  DOCUMENT_SIDE_MARGIN_MM,
  type OutputBranding,
} from './outputBranding';

const pdfImageFormat = (dataUrl?: string): 'PNG' | 'JPEG' | null => {
  const match = dataUrl?.match(/^data:image\/(png|jpe?g);base64,/i);
  if (!match) return null;
  return match[1].toLowerCase() === 'png' ? 'PNG' : 'JPEG';
};

const addBrandingImage = (
  pdf: any,
  dataUrl: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) => {
  const format = pdfImageFormat(dataUrl);
  if (!format) return;
  pdf.addImage(dataUrl, format, x, y, maxWidth, maxHeight);
};

const applyBrandingToPdf = (pdf: any, branding?: OutputBranding) => {
  if (!branding?.header_base64 && !branding?.footer_base64) return;
  const pageCount = pdf.internal.getNumberOfPages();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const startX = DOCUMENT_SIDE_MARGIN_MM;
  const contentWidth = DOCUMENT_CONTENT_WIDTH_MM;

  for (let page = 1; page <= pageCount; page += 1) {
    pdf.setPage(page);
    if (branding.header_base64) {
      addBrandingImage(
        pdf,
        branding.header_base64,
        startX,
        10,
        contentWidth,
        DOCUMENT_BRANDING_HEIGHT_MM,
      );
    }
    if (branding.footer_base64) {
      addBrandingImage(
        pdf,
        branding.footer_base64,
        startX,
        pageHeight - 20,
        contentWidth,
        DOCUMENT_BRANDING_HEIGHT_MM,
      );
    }
  }
};

export async function downloadHtmlAsPdf(
  htmlContent: string,
  filename: string,
  asBlob: boolean = false,
  branding?: OutputBranding,
) {
  const element = document.createElement('div');
  element.innerHTML = htmlContent;
  element.style.fontFamily = 'Arial, sans-serif';
  
  const opt: any = {
    margin:       branding ? [40, 15, 30, 15] : 10,
    filename:     `${filename}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  const worker = html2pdf().set(opt).from(element).toPdf();
  const pdf = await worker.get('pdf');
  applyBrandingToPdf(pdf, branding);

  if (asBlob) {
    return pdf.output('blob');
  } else {
    pdf.save(`${filename}.pdf`);
  }
}

const wordBrandingElement = (
  type: 'header' | 'footer',
  dataUrl?: string,
) => dataUrl
  ? `<div id="via-${type}" style="mso-element:${type}; text-align:center;"><p style="margin:0;"><img src="${dataUrl}" style="width:100%; height:${DOCUMENT_BRANDING_HEIGHT_MM * 72 / 25.4}pt;" /></p></div>`
  : '';

export function createHtmlDocBlob(
  htmlContent: string,
  filename: string,
  branding?: OutputBranding,
): Blob {
  const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset='utf-8'>
<title>${filename}</title>
<style>
  @page ViaCvSection {
    size: 595.3pt 841.9pt;
    margin: 85.04pt 42.52pt 70.87pt 42.52pt;
    mso-header-margin: 20pt;
    mso-footer-margin: 18pt;
    mso-header: via-header;
    mso-footer: via-footer;
  }
  div.ViaCvSection { page: ViaCvSection; }
  body, p, h1, h2, h3, h4, li, table, td, th {
    font-family: Arial, sans-serif !important;
  }
</style>
</head>
<body>${wordBrandingElement('header', branding?.header_base64)}${wordBrandingElement('footer', branding?.footer_base64)}<div class="ViaCvSection">`;
  const footer = `</div></body></html>`;
  const sourceHTML = header + htmlContent + footer;
  return new Blob([sourceHTML], { type: 'application/msword;charset=utf-8' });
}

export function downloadHtmlAsDocx(
  htmlContent: string,
  filename: string,
  branding?: OutputBranding,
) {
  const blob = createHtmlDocBlob(htmlContent, filename, branding);
  
  const source = URL.createObjectURL(blob);
  const fileDownload = document.createElement("a");
  document.body.appendChild(fileDownload);
  fileDownload.href = source;
  fileDownload.download = `${filename}.doc`;
  fileDownload.click();
  document.body.removeChild(fileDownload);
  URL.revokeObjectURL(source);
}
