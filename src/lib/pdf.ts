import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

// Re-declaring for TypeScript support in this file
declare module "jspdf" {
  interface jsPDF {
    autoTable: any;
  }
}

export interface PDFExportOptions {
  template: "General" | "Specialized";
  branding?: {
    ministry: string;
    department: string;
    tender_no: string;
    header_base64?: string;
    footer_base64?: string;
  };
  expert: any;
  position_title: string;
  certification?: {
    show: boolean;
    expertSignatureBase64?: string;
    expertSignatureDate?: string;
    repName?: string;
    repSignatureBase64?: string;
    repSignatureDate?: string;
  };
}

function getPdfImageFormat(dataUrl?: string): "PNG" | "JPEG" | null {
  if (!dataUrl) return null;
  const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,/i);
  if (!match) return null;
  return match[1].toLowerCase() === "png" ? "PNG" : "JPEG";
}

function addBrandingImage(
  doc: any,
  dataUrl: string,
  x: number,
  y: number,
  maxWidth: number,
  maxHeight: number,
) {
  const format = getPdfImageFormat(dataUrl);
  if (!format) return;

  const properties = doc.getImageProperties(dataUrl);
  const scale = Math.min(maxWidth / properties.width, maxHeight / properties.height);
  const width = properties.width * scale;
  const height = properties.height * scale;
  const centeredX = x + (maxWidth - width) / 2;
  const centeredY = y + (maxHeight - height) / 2;

  doc.addImage(dataUrl, format, centeredX, centeredY, width, height);
}

export function formatCertificationDate(value?: string): string {
  if (!value) return new Date().toLocaleDateString("en-GB");
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("en-GB");
}

export function cleanText(text: any, preserveNewlines: boolean = false): string {
  if (text === null || text === undefined) return "";
  let str = String(text);
  
  if (preserveNewlines) {
    str = str.replace(/\r|\t|\u00A0/g, " ");
    str = str.replace(/[ ]{2,}/g, " ");
  } else {
    str = str.replace(/\r|\n|\t|\u00A0/g, " ");
    str = str.replace(/\s+/g, " ");
  }

  const bad = ["not specified", "not mentioned", "null", "n/a", "undefined", "none", "no profile available", ""];
  
  let parts = str.split(',');
  parts = parts.filter(p => !bad.includes(p.trim().toLowerCase()));
  let result = parts.join(', ').trim();
  
  // Only process dashes if they aren't bullet points. If preserveNewlines is true, dashes might be bullets!
  if (!preserveNewlines) {
    let dashParts = result.split('-');
    dashParts = dashParts.filter(p => !bad.includes(p.trim().toLowerCase()));
    result = dashParts.join(' - ').trim();
  }
  
  if (bad.includes(result.toLowerCase())) return "";
  
  result = result.replace(/^[,\s]+|[,\s]+$/g, "");
  return result.trim();
}

export async function generateReformatedCV(options: PDFExportOptions) {
  const doc = new jsPDF();
  if (options.template === "Specialized") {
    return generateSpecialized(doc, options);
  }
  return generateDoc(doc, options);
}

function safeSplitText(doc: any, text: string, maxWidth: number): string[] {
  if (!text) return [];
  const blocks = String(text).split("\n");
  const result: string[] = [];

  blocks.forEach((block) => {
    let trimmedBlock = block.trim();
    const isBullet = trimmedBlock.startsWith("•") || trimmedBlock.startsWith("-");
    const indentStr = "    "; // 4 spaces for bullet indent

    const words = block
      .replace(/\r|\t|\u00A0/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    
    let currentLine = "";
    let isFirstLine = true;

    if (words.length === 0) {
      result.push("");
      return;
    }

    words.forEach((word) => {
      const prefix = (!isFirstLine && isBullet && currentLine === "") ? indentStr : "";
      const lineToTest = currentLine ? `${currentLine} ${word}` : `${prefix}${word}`;
      const width = doc.getTextWidth(lineToTest);
      
      if (width > maxWidth) {
        if (currentLine) {
          result.push(currentLine);
          isFirstLine = false;
          currentLine = isBullet ? indentStr + word : word;
        } else {
          result.push(lineToTest);
          isFirstLine = false;
          currentLine = "";
        }
      } else {
        currentLine = lineToTest;
      }
    });
    if (currentLine) {
      result.push(currentLine);
    }
  });

  return result;
}

function preparePdfSection(
  doc: any,
  currentY: number,
  pageHeight: number,
  pageTop: number,
  pageBottom: number,
  measuredContentHeight: number,
  before = 4,
): number {
  const gap = currentY > pageTop + 1 ? before : 0;
  const headingHeight = 5;
  if (currentY + gap + headingHeight + measuredContentHeight > pageHeight - pageBottom) {
    doc.addPage();
    return pageTop;
  }
  return currentY + gap;
}

function preparePdfContentBlock(
  doc: any,
  currentY: number,
  blockHeight: number,
  pageHeight: number,
  pageTop: number,
  pageBottom: number,
  before = 4,
): number {
  const gap = currentY > pageTop + 1 ? before : 0;
  if (currentY + gap + blockHeight > pageHeight - pageBottom) {
    doc.addPage();
    return pageTop;
  }
  return currentY + gap;
}

function drawPdfSectionDivider(
  doc: any,
  currentY: number,
  startX: number,
  contentWidth: number,
  pageHeight: number,
  pageTop: number,
  pageBottom: number,
): number {
  const spaceBefore = 3;
  const spaceAfter = 3;
  const followingSectionMinimum = 11;

  if (currentY + spaceBefore + spaceAfter + followingSectionMinimum > pageHeight - pageBottom) {
    doc.addPage();
    return pageTop;
  }

  const dividerY = currentY + spaceBefore;
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(startX, dividerY, startX + contentWidth, dividerY);
  doc.setDrawColor(0);
  doc.setLineWidth(0.1);
  return dividerY + spaceAfter;
}

function drawPdfRecordDivider(
  doc: any,
  currentY: number,
  startX: number,
  contentWidth: number,
): number {
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(0.2);
  doc.line(startX, currentY, startX + contentWidth, currentY);
  doc.setDrawColor(0);
  doc.setLineWidth(0.1);
  return currentY + 5;
}

function generateK1(doc: jsPDF, options: PDFExportOptions) {
  return generateDoc(doc, options);
}

function generateK2(doc: jsPDF, options: PDFExportOptions) {
  return generateDoc(doc, options);
}

function generateK9(doc: jsPDF, options: PDFExportOptions) {
  return generateDoc(doc, options);
}

function drawCertification(doc: any, options: PDFExportOptions, startX: number, contentWidth: number, pageHeight: number, currentY: number) {
  if (options.certification && options.certification.show === false) {
    return; // User opted out
  }

  const cert =
    "I, the undersigned, certify that to the best of my knowledge and belief, this CV correctly describes myself, my qualifications, and my experience, and I am available to undertake the assignment in case of an award. I understand that any misstatement or misrepresentation described herein may lead to my disqualification or dismissal by the Client, and/or sanctions by the Bank.";
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  const certLines = safeSplitText(doc, cert, contentWidth);
  const measuredHeight = certLines.length * 5 + 34;
  currentY = preparePdfSection(doc, currentY, pageHeight, 50, 40, measuredHeight);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text("CERTIFICATION:", startX, currentY);
  currentY += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(certLines, startX, currentY);
  currentY += certLines.length * 5 + 3;

  const expertName = options.expert.fullName || options.expert.name || "Name of Expert";
  const repName = options.certification?.repName || "";
  const expertDate = formatCertificationDate(options.certification?.expertSignatureDate);
  const repDate = formatCertificationDate(options.certification?.repSignatureDate);

  autoTable(doc, {
    startY: currentY,
    head: [],
    body: [
      [expertName, "", expertDate],
      ["Name of Expert", "Signature", "Date"],
      [repName, "", repDate],
      ["Name of authorized representative of the Consultant", "Signature", "Date"],
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, textColor: 0, lineColor: [200, 200, 200], lineWidth: 0.1 },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.4 },
      1: { cellWidth: contentWidth * 0.4, halign: "center" },
      2: { cellWidth: contentWidth * 0.2 },
    },
    margin: { left: startX, right: startX, top: 50, bottom: 40 },
    didDrawCell: (data: any) => {
      // Draw signature images if provided
      if (data.section === "body" && data.column.index === 1) {
        if (data.row.index === 0 && options.certification?.expertSignatureBase64) {
          try {
            const format = getPdfImageFormat(options.certification.expertSignatureBase64);
            if (format) doc.addImage(options.certification.expertSignatureBase64, format, data.cell.x + 2, data.cell.y + 2, data.cell.width - 4, data.cell.height - 4);
          } catch(e){}
        } else if (data.row.index === 2 && options.certification?.repSignatureBase64) {
          try {
            const format = getPdfImageFormat(options.certification.repSignatureBase64);
            if (format) doc.addImage(options.certification.repSignatureBase64, format, data.cell.x + 2, data.cell.y + 2, data.cell.width - 4, data.cell.height - 4);
          } catch(e){}
        }
      }
    }
  });
}

function generateDoc(doc: any, options: PDFExportOptions) {
  const { branding, expert, position_title } = options;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const startX = 15;
  const contentWidth = pageWidth - startX * 2;

  const drawHeader = (doc: any, pageNum: number) => {
    if (branding?.header_base64) {
      addBrandingImage(doc, branding.header_base64, startX, 10, contentWidth, 25);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(0);
      doc.text("MINISTRY OF AGRICULTURAL, FISHERIES WEALTH AND WATER RESOURCES", startX, 15);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(9);
      doc.text("Consultancy Services for Design Review & Construction Supervision of Wadi Bani Umar Flood Protection", startX, 20);
      doc.text("Dam (A) in Wilayat Liwa, North Al Batinah Governorate, Sultanate of Oman", startX, 25);
      doc.setDrawColor(0, 85, 170);
      doc.setLineWidth(1);
      doc.line(startX, 28, startX + contentWidth, 28);
      doc.setDrawColor(0);
      doc.setLineWidth(0.1);
    }
  };

  const drawFooter = (doc: any, pageNum: number, totalPages: number) => {
    doc.setPage(pageNum);
    if (branding?.footer_base64) {
      addBrandingImage(doc, branding.footer_base64, startX, pageHeight - 20, contentWidth, 12);
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(14);
      doc.setTextColor(0, 85, 170);
      doc.text("VIA", startX + 5, pageHeight - 12);
      doc.setFontSize(8);
      doc.text("INTERNATIONAL", startX, pageHeight - 8);
      doc.setFont("helvetica", "italic");
      doc.setFontSize(11);
      doc.setTextColor(100);
      doc.text("Technical Proposal", pageWidth / 2, pageHeight - 12, { align: "center" });
    }
  };

  let y = 40;
  doc.setTextColor(0);
  doc.setFontSize(11);
  const resolvedTitle = position_title && !position_title.startsWith("pos_") ? position_title : (expert.primary_position || "Resident Inspector");
  
  const fields = [
    ["PROPOSED POSITION:", resolvedTitle],
    ["NAME OF EXPERT:", cleanText(expert.fullName || expert.name)],
  ];
  if (cleanText(expert.birth_date || expert.dateOfBirth)) {
    fields.push(["DATE OF BIRTH:", cleanText(expert.birth_date || expert.dateOfBirth)]);
  }
  if (cleanText(expert.nationality || expert.countryOfCitizenship)) {
    fields.push(["COUNTRY OF CITIZENSHIP:", cleanText(expert.nationality || expert.countryOfCitizenship)]);
  }

  fields.forEach((f) => {
    doc.setFont("helvetica", "bold");
    doc.text(f[0], startX, y);
    doc.setFont("helvetica", "bold");
    doc.text(f[1], startX + 60, y);
    y += 7;
  });

  y += 2;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(startX, y, startX + contentWidth, y);
  y += 3;

  // EDUCATION
  y = preparePdfSection(doc, y, pageHeight, 40, 30, 10);
  doc.setFont("helvetica", "bold");
  doc.text("EDUCATION:", startX, y);
  y += 6;
  let educationArr: string[] = [];
  if (expert.metadata?.educations?.length > 0) {
    educationArr = expert.metadata.educations.map((ed: any) => `${ed.degree || ""}${ed.field ? " in " + ed.field : ""}${ed.institution ? ", " + ed.institution : ""}${ed.year ? ", " + ed.year : ""}`.trim());
  } else if (Array.isArray(expert.education)) {
    educationArr = expert.education;
  } else if (expert.educationLevel) {
    educationArr = [expert.educationLevel];
  } else if (expert.education) {
    educationArr = [expert.education];
  }
  educationArr.forEach((edu: string) => {
    doc.setFont("helvetica", "bolditalic");
    const lines = safeSplitText(doc, `•   ${edu}`, contentWidth - 10);
    doc.text(lines, startX + 5, y);
    y += lines.length * 5 + 1;
  });

  // PROFILE
  if (cleanText(expert.profile_summary || expert.summary)) {
    const profileLines = safeSplitText(doc, cleanText(expert.profile_summary || expert.summary), contentWidth);
    y = preparePdfSection(doc, y, pageHeight, 40, 30, Math.min(profileLines.length, 2) * 5.5);
    doc.setFont("helvetica", "bold");
    doc.text("PROFILE:", startX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(profileLines, startX, y, { lineHeightFactor: 1.5, align: "justify", maxWidth: contentWidth });
    y += profileLines.length * 5.5;
  }

  // EMPLOYMENT TABLE
  y = preparePdfSection(doc, y, pageHeight, 40, 30, 18);
  doc.setFont("helvetica", "bold");
  doc.text("EMPLOYMENT RECORD RELEVANT TO THE ASSIGNMENT:", startX, y);
  y += 5;

  const tableData = (expert.employment_history || expert.experiences || []).map((h: any) => {
    let period = h.duration || "";
    if (!period) period = `${h.start_date || ""} 
${h.end_date ? "to " + h.end_date : ""}`;
    
    let employerInfo = `Employer:
${cleanText(h.organization || h.client || "")}
Position: ${cleanText(h.role || "")}`;
    if (h.project) {
        employerInfo += `

${cleanText(h.project)}`;
    }
    
    let rawDesc = String(h.description || "");
    const parts = rawDesc.split(/\n/);
    let summaryText = parts.map(p => {
        let line = p.trim();
        if (!line) return "";
        if (line.startsWith("-") || line.startsWith("•")) {
            line = line.substring(1).trim();
        }
        return "• " + cleanText(line, true);
    }).filter(Boolean).join('\n');
    
    return [
      cleanText(period, true),
      employerInfo,
      cleanText(h.country || ""),
      summaryText,
    ];
  });

  autoTable(doc, {
    startY: y,
    head: [[ "Period", "Employing\nOrganization", "Country", "Summary of activities performed relevant to\nthe Assignment" ]],
    body: tableData,
    theme: "grid",
    styles: { fontSize: 10, cellPadding: 2, textColor: [0, 0, 0], lineColor: [0, 0, 0], lineWidth: 0.2, font: "helvetica" },
    headStyles: { fillColor: [255, 255, 255], textColor: 0, fontStyle: "bold", halign: "center", valign: "middle", lineWidth: 0.2, lineColor: [0, 0, 0] },
    columnStyles: {
      0: { cellWidth: 20, halign: "center", valign: "top" },
      1: { cellWidth: 50, halign: "center", valign: "top" },
      2: { cellWidth: 25, halign: "center", valign: "top" },
      3: { cellWidth: "auto", halign: "left", valign: "top" },
    },
    rowPageBreak: "auto",
    margin: { left: startX, right: startX, top: 40, bottom: 30 },
  });
  y = (doc as any).lastAutoTable.finalY;

  // PRIOR WORK (ADEQUACY)
  y = preparePdfSection(doc, y, pageHeight, 40, 30, 16);
  doc.setFont("helvetica", "bold");
  doc.text("Reference to Prior Work/Assignments that Best Illustrates Capability to Handle the Assigned", startX, y);
  y += 5;
  doc.text("Tasks", startX, y);
  y += 6;
  doc.setDrawColor(0);
  doc.setLineWidth(0.3);
  doc.line(startX, y, startX + contentWidth, y);
  y += 4;

  const adequacyItems = expert.adequacy_experience || [];
  adequacyItems.forEach((item: any, itemIndex: number) => {
    const af = [
      ["Period", item.period || ""],
      ["Country", item.country || ""],
      ["Position", item.position || ""],
      ["Client", item.client || ""],
      ["Assignment", item.assignment || item.assignmentDescription || ""],
    ].filter((f) => f[1]);

    let blockHeight = 0;
    af.forEach((f) => {
      const wrapLines = safeSplitText(doc, f[1], contentWidth - 35);
      blockHeight += Math.max(1, wrapLines.length) * 5;
    });

    const dividerHeight = itemIndex > 0 ? 5 : 0;
    if (y + dividerHeight + blockHeight + 5 > pageHeight - 30) {
      doc.addPage();
      y = 40;
    } else if (itemIndex > 0) {
      y = drawPdfRecordDivider(doc, y, startX, contentWidth);
    }

    af.forEach((f) => {
      doc.setFont("helvetica", "italic");
      doc.text(f[0], startX, y);
      
      let fontStyle = "normal";
      if (f[0] === "Position" || f[0] === "Assignment") fontStyle = "bold";
      doc.setFont("helvetica", fontStyle);

      let textToRender = String(f[1] || "");
      if (f[0] === "Assignment") {
          const lines = textToRender.split('\n').map(l => l.trim()).filter(Boolean);
          textToRender = lines.map(line => {
              if (line.startsWith("-") || line.startsWith("•")) {
                  line = line.substring(1).trim();
              }
              return "• " + line;
          }).join('\n');
      }

      const wrapLines = safeSplitText(doc, textToRender, contentWidth - 35);
      doc.text(wrapLines, startX + 30, y);
      y += wrapLines.length * 5;
    });
    
  });

  if (adequacyItems.length > 0) {
    y = drawPdfSectionDivider(doc, y, startX, contentWidth, pageHeight, 40, 30);
  }

  // MEMBERSHIP
  let membersArrRaw = expert.professionalMembership || expert.memberships || expert.professional_associations || [];
  let membersArr = Array.isArray(membersArrRaw) ? membersArrRaw : typeof membersArrRaw === 'string' ? membersArrRaw.split(',').map(s => s.trim()) : [];
  if (membersArr.length > 0) {
    const firstMemberLines = safeSplitText(doc, `-   ${membersArr[0]}`, contentWidth - 10);
    y = preparePdfSection(doc, y, pageHeight, 40, 30, Math.max(1, firstMemberLines.length) * 5);
    doc.setFont("helvetica", "bold");
    doc.text("MEMBERSHIP IN PROFESSIONAL ASSOCIATIONS:", startX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    membersArr.forEach((m: string) => {
      const lines = safeSplitText(doc, `-   ${m}`, contentWidth - 10);
      doc.text(lines, startX, y);
      y += lines.length * 5 + 1;
    });
  }

  // LANGUAGE SKILLS
  let langArrRaw = expert.languages || expert.metadata?.languages || [];
  let langArr = Array.isArray(langArrRaw) ? langArrRaw : typeof langArrRaw === 'string' ? langArrRaw.split(',').map(s => ({ name: s.trim() })) : [];
  if (langArr.length > 0) {
    y = preparePdfSection(doc, y, pageHeight, 40, 30, 10);
    doc.setFont("helvetica", "bold");
    doc.text("LANGUAGE SKILLS:", startX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    langArr.forEach((l: any) => {
      let lText = typeof l === "string" ? l : (l.name || "");
      if (l.level) lText += `: ${l.level}`;
      const lines = safeSplitText(doc, `-   ${lText}`, contentWidth - 10);
      doc.text(lines, startX + 5, y);
      y += lines.length * 5 + 1;
    });
  }

  // CONTACT INFO
  if (expert.email || expert.phone) {
    doc.setFont("helvetica", "bold");
    const contactText = `EXPERT'S CONTACT INFORMATION : (e-mail : ${cleanText(expert.email)}, phone ${cleanText(expert.phone)})`;
    const contactLines = safeSplitText(doc, contactText, contentWidth);
    const contactHeight = Math.max(1, contactLines.length) * 5;
    y = preparePdfContentBlock(doc, y, contactHeight, pageHeight, 40, 30);
    doc.text(contactLines, startX, y);
    y += contactHeight;
  }

  // CERTIFICATION AND SIGNATURES
  if (options.certification?.show !== false) {
    const certText = "I, the undersigned, certify that to the best of my knowledge and belief, this CV correctly describes myself, my qualifications, and my experience, and I am available to undertake the assignment in case of an award. I understand that any misstatement or misrepresentation described herein may lead to my disqualification or dismissal by the Client, and/or sanctions by the Bank.";
    doc.setFont("helvetica", "normal");
    const certLines = safeSplitText(doc, certText, contentWidth);
    y = preparePdfSection(doc, y, pageHeight, 40, 30, certLines.length * 5.5 + 58);
    doc.setFont("helvetica", "bold");
    doc.text("CERTIFICATION:", startX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
    doc.text(certLines, startX, y, { lineHeightFactor: 1.5, align: "justify", maxWidth: contentWidth });
    y += certLines.length * 5.5 + 8;

    doc.text(cleanText(expert.fullName || expert.name).toUpperCase(), startX, y);
    if (options.certification?.expertSignatureBase64) {
      const format = getPdfImageFormat(options.certification.expertSignatureBase64);
      if (format) doc.addImage(options.certification.expertSignatureBase64, format, startX + 60, y - 10, 30, 15);
    }
    doc.text(formatCertificationDate(options.certification?.expertSignatureDate), pageWidth - startX - 30, y);
    y += 6;
    doc.setDrawColor(200);
    doc.line(startX, y, startX + 50, y);
    doc.line(startX + 60, y, startX + 110, y);
    doc.line(pageWidth - startX - 35, y, pageWidth - startX, y);
    y += 5;
    doc.text("Name of Expert", startX, y);
    doc.text("Signature", startX + 70, y);
    doc.text("Date", pageWidth - startX - 25, y);
    
    y += 12;

    doc.text((options.certification?.repName || "").toUpperCase(), startX, y);
    if (options.certification?.repSignatureBase64) {
      const format = getPdfImageFormat(options.certification.repSignatureBase64);
      if (format) doc.addImage(options.certification.repSignatureBase64, format, startX + 60, y - 10, 30, 15);
    }
    doc.text(formatCertificationDate(options.certification?.repSignatureDate), pageWidth - startX - 30, y);
    y += 6;
    doc.setDrawColor(200);
    doc.line(startX, y, startX + 50, y);
    doc.line(startX + 60, y, startX + 110, y);
    doc.line(pageWidth - startX - 35, y, pageWidth - startX, y);
    y += 5;
    doc.text("Name of authorized", startX, y);
    doc.text("Signature", startX + 70, y);
    doc.text("Date", pageWidth - startX - 25, y);
    y += 5;
    doc.text("Representative of the Consultant", startX, y);
  }

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    drawHeader(doc, i);
    drawFooter(doc, i, pageCount);
  }

  return doc;
}
function generateSpecialized(doc: any, options: PDFExportOptions) {
  const { branding, expert, position_title } = options;
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const startX = 20;
  const contentWidth = pageWidth - startX * 2;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(0, 100, 200);
  doc.text("FORM TECH-6", 105, 42, { align: "center" });
  doc.text("CURRICULUM VITAE (CV)", 105, 48, { align: "center" });

  let y = 55;

  // Boxed Info
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.rect(startX, y, contentWidth, 30);

  doc.setFontSize(10);
  doc.setTextColor(0);

  const resolvedTitle = position_title && !position_title.startsWith("pos_") ? position_title : (expert.primary_position || "Specialist");
  const rows = [
    ["PROPOSED POSITION:", resolvedTitle],
    ["NAME OF EXPERT:", cleanText(expert.fullName || expert.name)],
    ["DATE OF BIRTH:", cleanText(expert.birth_date || expert.dateOfBirth)],
    ["COUNTRY OF CITIZENSHIP:", cleanText(expert.nationality || expert.countryOfCitizenship)],
  ];

  rows.forEach((row, i) => {
    doc.setFont("helvetica", "bold");
    doc.text(row[0], startX, y + 7 + i * 6);
    doc.setFont("helvetica", "normal");
    doc.text(row[1], startX + 55, y + 7 + i * 6);
    if (i < 3)
      doc.line(startX, y + 9 + i * 6, startX + contentWidth, y + 9 + i * 6);
  });

  y += 34;

  // Education
  y = preparePdfSection(doc, y, pageHeight, 50, 40, 10);
  doc.setFont("helvetica", "bold");
  doc.text("EDUCATION:", startX, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  let educationArr: string[] = [];
  if (expert.metadata?.educations?.length > 0) {
    educationArr = expert.metadata.educations.map((ed: any) => `${ed.degree || ""}${ed.field ? " in " + ed.field : ""}${ed.institution ? ", " + ed.institution : ""}${ed.year ? ", " + ed.year : ""}`.trim());
  } else if (Array.isArray(expert.education)) {
    educationArr = expert.education;
  } else if (expert.educationLevel) {
    educationArr = [expert.educationLevel];
  } else if (expert.education) {
    educationArr = [expert.education];
  }

  educationArr.forEach((edu: string) => {
    const lines = safeSplitText(doc, `• ${edu}`, contentWidth - 10);
    doc.text(lines, startX + 5, y);
    y += lines.length * 5 + 1;
  });

  // Profile
  const profileLines = safeSplitText(
    doc,
    cleanText(expert.profile_summary || expert.summary),
    contentWidth,
  );
  y = preparePdfSection(doc, y, pageHeight, 50, 40, Math.min(profileLines.length, 2) * 5);
  doc.setFont("helvetica", "bold");
  doc.text("PROFILE:", startX, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.text(profileLines, startX, y);
  y += profileLines.length * 5;


  // SKILLS
  const skillsData = expert.skills || [];
  if (skillsData.length > 0 || typeof skillsData === "string") {
    const skillsStr = Array.isArray(skillsData)
      ? skillsData.join(", ")
      : skillsData;
    const skillsLines = safeSplitText(
      doc,
      skillsStr,
      contentWidth - doc.getTextWidth("Skills: ") - 15,
    );
    y = preparePdfSection(doc, y, pageHeight, 50, 40, Math.max(1, skillsLines.length) * 5, 3);
    doc.setFont("helvetica", "bold");
    doc.text("Skills:", startX, y);
    doc.setFont("helvetica", "normal");
    doc.text(skillsLines, startX + doc.getTextWidth("Skills: ") + 2, y);
    y += Math.max(1, skillsLines.length) * 5;
  }

  // SOFTWARE
  const softwareData = expert.software || expert.computer_skills || [];
  if (softwareData.length > 0 || typeof softwareData === "string") {
    const softwareStr = Array.isArray(softwareData)
      ? softwareData.join(", ")
      : softwareData;
    const softwareLines = safeSplitText(
      doc,
      softwareStr,
      contentWidth - doc.getTextWidth("Software: ") - 15,
    );
    y = preparePdfSection(doc, y, pageHeight, 50, 40, Math.max(1, softwareLines.length) * 5, 3);
    doc.setFont("helvetica", "bold");
    doc.text("Software:", startX, y);
    doc.setFont("helvetica", "normal");
    doc.text(softwareLines, startX + doc.getTextWidth("Software: ") + 2, y);
    y += Math.max(1, softwareLines.length) * 5;
  }

  // TRAINING / COURSES
  let trainingArr = expert.training || expert.training_courses || expert.courses || [];
  if (expert.metadata?.certifications?.length > 0) {
    const certs = expert.metadata.certifications.map((c: any) => c.title || c.description || "");
    trainingArr = [...trainingArr, ...certs].filter(Boolean);
  } else if (Array.isArray(expert.certifications)) {
    trainingArr = [...trainingArr, ...expert.certifications.map((c: any) => typeof c === "string" ? c : c.title || "")].filter(Boolean);
  } else if (typeof expert.certifications === "string") {
    trainingArr = [...trainingArr, ...expert.certifications.split(",").map((c: any) => c.trim())].filter(Boolean);
  }

  if (trainingArr.length > 0) {
    const firstTrainingLines = safeSplitText(doc, String(trainingArr[0]), contentWidth - 10);
    y = preparePdfSection(doc, y, pageHeight, 50, 40, Math.max(1, firstTrainingLines.length) * 5);
    doc.setFont("helvetica", "bold");
    doc.text("Training/ Courses:", startX, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    trainingArr.forEach((course: string) => {
      const lines = safeSplitText(doc, `•   ${course}`, contentWidth - 10);
      if (y + lines.length * 5 > pageHeight - 30) {
        doc.addPage();
        y = 50;
      }
      doc.text(lines, startX + 5, y);
      y += lines.length * 5 + 1;
    });
  }

  // PROJECTS
  const projectsArr = expert.projects || [];
  if (projectsArr.length > 0) {
    const firstProject = projectsArr[0];
    const firstProjectText = typeof firstProject === "string" ? firstProject : (firstProject.description || firstProject.assignmentDescription || JSON.stringify(firstProject));
    const firstProjectLines = safeSplitText(doc, firstProjectText, contentWidth - 10);
    y = preparePdfSection(doc, y, pageHeight, 50, 40, Math.max(1, firstProjectLines.length) * 5);
    doc.setFont("helvetica", "bold");
    doc.text("Projects:", startX, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    projectsArr.forEach((proj: string | any) => {
      const projStr = typeof proj === "string" ? proj : (proj.description || proj.assignmentDescription || JSON.stringify(proj));
      const lines = safeSplitText(doc, `•   ${projStr}`, contentWidth - 10);
      if (y + lines.length * 5 > pageHeight - 30) {
        doc.addPage();
        y = 50;
      }
      doc.text(lines, startX + 5, y);
      y += lines.length * 5 + 1;
    });
  }

  // ADDITIONAL INFORMATION
  const additionalArr = expert.metadata?.unmapped_data || expert.additional_information || [];
  if (additionalArr.length > 0) {
    const firstInfo = additionalArr[0];
    const firstInfoText = typeof firstInfo === "string" ? firstInfo : (firstInfo.key && firstInfo.value ? `${firstInfo.key}: ${firstInfo.value}` : JSON.stringify(firstInfo));
    const firstInfoLines = safeSplitText(doc, firstInfoText, contentWidth - 10);
    y = preparePdfSection(doc, y, pageHeight, 50, 40, Math.max(1, firstInfoLines.length) * 5);
    doc.setFont("helvetica", "bold");
    doc.text("Additional Information:", startX, y);
    y += 7;
    doc.setFont("helvetica", "normal");
    additionalArr.forEach((info: string | any) => {
      const infoStr = typeof info === "string" ? info : (info.key && info.value ? `${info.key}: ${info.value}` : JSON.stringify(info));
      const lines = safeSplitText(doc, `•   ${infoStr}`, contentWidth - 10);
      if (y + lines.length * 5 > pageHeight - 30) {
        doc.addPage();
        y = 50;
      }
      doc.text(lines, startX + 5, y);
      y += lines.length * 5 + 1;
    });
  }

  // Employment Record Table
  y = preparePdfSection(doc, y, pageHeight, 50, 40, 16);
  doc.setFont("helvetica", "bold");
  doc.text("EMPLOYMENT RECORD RELEVANT TO THE ASSIGNMENT:", startX, y);
  y += 5;

  const cleanStr = (s: any) => cleanText(s, true);

  const tableData = (expert.employment_history || expert.experiences || []).map((h: any) => [
    cleanStr(`${h.start_date || ""} - ${h.end_date || ""}`),
    cleanStr(`Employer: ${h.client || ""}\nPositions held: ${h.role || ""}`),
    cleanStr(h.country || ""),
    (() => {
      let rawDesc = String(h.description || "");
      const parts = rawDesc.split(/\n/);
      return parts.map(p => {
          let line = p.trim();
          if (!line) return "";
          if (line.startsWith("-") || line.startsWith("•")) {
              line = line.substring(1).trim();
          }
          return "• " + cleanStr(line);
      }).filter(Boolean).join('\n');
    })(),
  ]);

  autoTable(doc, {
    startY: y,
    head: [
      ["Period", "Employing organization", "Country", "Summary of activities"],
    ],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [220, 220, 220], textColor: 0, fontStyle: "bold" },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 50 },
      2: { cellWidth: 25 },
      3: { cellWidth: "auto" },
    },
    rowPageBreak: "avoid",
    margin: { left: startX, right: startX, top: 50, bottom: 40 },
  });

  y = (doc as any).lastAutoTable.finalY;

  // ADEQUACY FOR THE ASSIGNMENT
  if (expert.adequacy_experience && expert.adequacy_experience.length > 0) {
    y = preparePdfSection(doc, y, pageHeight, 50, 40, 15);
    doc.setFont("helvetica", "bold");
    doc.text("ADEQUACY FOR THE ASSIGNMENT - KEY EXPERIENCE:", startX, y);
    y += 5;

    (expert.adequacy_experience || []).forEach((item: any, itemIndex: number) => {
      const af = [
        ["Period", item.period || ""],
        ["Country", item.country || ""],
        ["Client", item.client || ""],
        ["Position", item.position || ""],
        ["Assignment", item.assignment || item.assignmentDescription || ""],
      ].filter((f) => f[1]); // only display existing values

      let blockHeight = 0;
      af.forEach((f) => {
        let fontStyle = "normal";
        if (f[0] === "Position") fontStyle = "bold";
        if (f[0] === "Assignment") fontStyle = "italic";
        doc.setFont("helvetica", fontStyle);
        let textToRender = String(f[1] || "");
        if (f[0] === "Assignment") {
            const lines = textToRender.split('\n').map(l => l.trim()).filter(Boolean);
            textToRender = lines.map(line => {
                if (line.startsWith("-") || line.startsWith("•")) {
                    line = line.substring(1).trim();
                }
                return "• " + line;
            }).join('\n');
        }
        const wrapLines = safeSplitText(doc, textToRender, contentWidth - 45);
        blockHeight += Math.max(1, wrapLines.length) * 5;
      });

      const dividerHeight = itemIndex > 0 ? 5 : 0;
      if (y + dividerHeight + blockHeight + 5 > pageHeight - 30) {
        doc.addPage();
        y = 50;
      } else if (itemIndex > 0) {
        y = drawPdfRecordDivider(doc, y, startX, contentWidth);
      }

      af.forEach((f) => {
        doc.setFont("helvetica", "italic");
        const titleLines = safeSplitText(doc, f[0], 35);

        let fontStyle = "normal";
        if (f[0] === "Position") fontStyle = "bold";
        if (f[0] === "Assignment") fontStyle = "italic";

        doc.setFont("helvetica", fontStyle);
        let textToRender = String(f[1] || "");
        if (f[0] === "Assignment") {
            const lines = textToRender.split('\n').map(l => l.trim()).filter(Boolean);
            textToRender = lines.map(line => {
                if (line.startsWith("-") || line.startsWith("•")) {
                    line = line.substring(1).trim();
                }
                return "• " + line;
            }).join('\n');
        }
        const wrapLines = safeSplitText(doc, textToRender, contentWidth - 45);

        doc.setFont("helvetica", "italic");
        doc.text(f[0], startX, y);
        doc.setFont("helvetica", fontStyle);
        doc.text(wrapLines, startX + 40, y);
        y += wrapLines.length * 5;
      });
    });

    y = drawPdfSectionDivider(doc, y, startX, contentWidth, pageHeight, 50, 40);
  }

  doc.setDrawColor(0);

  // LANGUAGE SKILLS
  let languagesArr: any[] = [];
  if (expert.metadata?.languages?.length > 0) {
    languagesArr = expert.metadata.languages.map((l: any) => l.name || l);
  } else if (Array.isArray(expert.languages)) {
    languagesArr = expert.languages.map((l: any) => typeof l === "string" ? l : l.name || "");
  } else if (typeof expert.languages === "string") {
    languagesArr = expert.languages.split(",").map((l: string) => l.trim());
  }

  if (languagesArr.length > 0) {
    y = preparePdfSection(doc, y, pageHeight, 50, 40, 10);
    doc.setFont("helvetica", "bold");
    doc.text("LANGUAGE SKILLS:", startX, y);
    y += 6;
    doc.setFont("helvetica", "normal");
  }

  languagesArr.forEach((lang: string) => {
    doc.text(`•   ${lang}`, startX + 5, y);
    y += 5;
  });

  // CONTACT INFO
  if (expert.email || expert.phone) {
    doc.setFont("helvetica", "bold");
    const contactText = `EXPERT'S CONTACT INFORMATION: (e-mail: ${cleanText(expert.email)}, phone: ${cleanText(expert.phone)})`;
    const contactLines = safeSplitText(doc, contactText, contentWidth);
    const contactHeight = Math.max(1, contactLines.length) * 5;
    y = preparePdfContentBlock(doc, y, contactHeight, pageHeight, 50, 40);
    doc.text(contactLines, startX, y);
    y += contactHeight;
  }
  
  drawCertification(doc, options, startX, contentWidth, pageHeight, y);

  // Header/Footer loop
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);

    // Header
    if (branding?.header_base64) {
      addBrandingImage(doc, branding.header_base64, startX, 10, contentWidth, 25);
    }

    // Footer
    doc.setFontSize(7);
    doc.setTextColor(100);

    if (branding?.footer_base64) {
      addBrandingImage(
        doc,
        branding.footer_base64,
        startX,
        275,
        contentWidth,
        12,
      );
    }

    doc.text(`GENERATED CV | FORM TECH-6`, 105, 290, { align: "center" });
    doc.text(`Page ${i} of ${pageCount}`, 180, 290);
  }

  return doc;
}
