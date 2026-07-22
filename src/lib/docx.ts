import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  BorderStyle,
  WidthType,
  AlignmentType,
  Header,
  Footer,
  ImageRun,
} from "docx";
import { saveAs } from "file-saver";
import { formatCertificationDate, PDFExportOptions } from "./pdf";

export function cleanText(text: any, preserveNewlines = false): string {
  if (text === null || text === undefined) return "";
  let str = String(text);
  if (preserveNewlines) {
    str = str.replace(/\r|\t|\u00A0/g, " ");
  } else {
    str = str.replace(/\r|\n|\t|\u00A0/g, " ");
    str = str.replace(/\s+/g, " ");
  }
  const bad = ["not specified", "not mentioned", "null", "n/a", "undefined", "none", "no profile available", ""];
  let parts = str.split(',');
  parts = parts.filter(p => !bad.includes(p.trim().toLowerCase()));
  let result = parts.join(', ').trim();
  if (!preserveNewlines) {
    let dashParts = result.split('-');
    dashParts = dashParts.filter(p => !bad.includes(p.trim().toLowerCase()));
    result = dashParts.join(' - ').trim();
  }
  if (bad.includes(result.toLowerCase())) return "";
  result = result.replace(/^[,\s]+|[,\s]+$/g, "");
  return result.trim();
}

function createTextParagraph(text: string, options: any = {}) {
    const lines = text.split('\n');
    return lines.map((line, idx) => {
        return new Paragraph({
            children: [new TextRun({ text: line, ...options })],
            spacing: { after: idx === lines.length - 1 ? (options.spacingAfter || 120) : 0 },
            alignment: options.alignment || AlignmentType.LEFT
        });
    });
}

export async function generateDocxCV(options: PDFExportOptions, download = true): Promise<Blob> {
  const { expert, position_title, certification } = options;
  const resolvedTitle = position_title && !position_title.startsWith("pos_") ? position_title : (expert.primary_position || "Resident Inspector");

  const header = new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: "MINISTRY OF AGRICULTURAL, FISHERIES WEALTH AND WATER RESOURCES", bold: true, size: 20 }),
          new TextRun({ text: "\nConsultancy Services for Design Review & Construction Supervision of Wadi Bani Umar Flood Protection", italics: true, size: 18 }),
          new TextRun({ text: "\nDam (A) in Wilayat Liwa, North Al Batinah Governorate, Sultanate of Oman", italics: true, size: 18 }),
        ],
        border: { bottom: { color: "0055AA", space: 10, style: BorderStyle.THICK, size: 12 } },
        spacing: { after: 300 },
      }),
    ],
  });

  const footer = new Footer({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: "VIA", bold: true, color: "0055AA", size: 24 }),
          new TextRun({ text: " INTERNATIONAL\t\t", color: "0055AA", size: 12 }),
          new TextRun({ text: "Technical Proposal", italics: true, color: "888888", size: 20 }),
        ],
      }),
    ],
  });

  let children: any[] = [];
  const compactCellMargins = { top: 50, bottom: 50, left: 70, right: 70 };
  const compactBulletSpacing = { after: 30 };
  const createSectionHeading = (text: string, border?: any) =>
      new Paragraph({
          children: [new TextRun({ text, bold: true, size: 22 })],
          border,
          spacing: { before: 120, after: 60 },
          keepNext: true,
          keepLines: true,
      });

  const addField = (label: string, value: string) => {
      children.push(
          new Paragraph({
              children: [
                  new TextRun({ text: label.padEnd(30, ' '), bold: true, size: 22 }),
                  new TextRun({ text: "\t\t" + value, bold: true, size: 22 }),
              ],
              spacing: { after: 60 },
          })
      );
  };

  addField("PROPOSED POSITION:", resolvedTitle);
  addField("NAME OF EXPERT:", cleanText(expert.fullName || expert.name));
  if (expert.dateOfBirth || expert.birth_date) addField("DATE OF BIRTH:", cleanText(expert.dateOfBirth || expert.birth_date));
  if (expert.countryOfCitizenship || expert.nationality) addField("COUNTRY OF CITIZENSHIP:", cleanText(expert.countryOfCitizenship || expert.nationality));

  children.push(new Paragraph({
      border: { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } },
      spacing: { after: 80 }
  }));

  children.push(createSectionHeading("EDUCATION:"));
  
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
      children.push(new Paragraph({
          children: [new TextRun({ text: `• ${edu}`, bold: true, italics: true, size: 22 })],
          spacing: compactBulletSpacing,
          keepLines: true,
      }));
  });

  if (expert.profileSummary || expert.summary || expert.profile_summary) {
      children.push(createSectionHeading("PROFILE:"));
      children.push(new Paragraph({
          children: [new TextRun({ text: cleanText(expert.profileSummary || expert.summary || expert.profile_summary), size: 22 })],
          alignment: AlignmentType.JUSTIFIED,
          spacing: { after: 80 },
      }));
  }

  children.push(createSectionHeading("EMPLOYMENT RECORD RELEVANT TO THE ASSIGNMENT:"));

  const tableRows = [
      new TableRow({
          tableHeader: true,
          cantSplit: true,
          children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Period", bold: true, size: 20 })], alignment: AlignmentType.CENTER })], margins: compactCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Employing\nOrganization", bold: true, size: 20 })], alignment: AlignmentType.CENTER })], margins: compactCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Country", bold: true, size: 20 })], alignment: AlignmentType.CENTER })], margins: compactCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: "Summary of activities performed relevant to\nthe Assignment", bold: true, size: 20 })], alignment: AlignmentType.CENTER })], margins: compactCellMargins }),
          ],
      })
  ];

  (expert.employment_history || expert.experiences || []).forEach((h: any) => {
      let period = h.duration || "";
      if (!period) period = `${h.start_date || ""} \nto ${h.end_date || "date"}`;
      
      const employerCellChildren = [];
      employerCellChildren.push(new Paragraph({ children: [new TextRun({ text: "Employer:", size: 20 })], alignment: AlignmentType.CENTER }));
      employerCellChildren.push(new Paragraph({ children: [new TextRun({ text: cleanText(h.organization || h.client || ""), bold: true, size: 20 })], alignment: AlignmentType.CENTER }));
      employerCellChildren.push(new Paragraph({ children: [new TextRun({ text: "Position: ", size: 20 }), new TextRun({ text: cleanText(h.role || ""), bold: true, size: 20 })], alignment: AlignmentType.CENTER }));
      if (h.project) {
          employerCellChildren.push(new Paragraph({ children: [new TextRun({ text: cleanText(h.project), size: 20 })], alignment: AlignmentType.CENTER, spacing: { before: 40 } }));
      }

      const summaryRaw = String(h.description || "");
      const summaryLines = summaryRaw.split(/\n|•|(?=- )/).map(l => l.trim()).filter(Boolean);
      const summaryCellChildren = summaryLines.map(line => {
          if (line.startsWith('-')) {
              line = line.substring(1).trim();
          }
          return new Paragraph({ 
              children: [new TextRun({ text: "- " + cleanText(line, true), size: 20 })],
              spacing: compactBulletSpacing,
              indent: { left: 200, hanging: 200 }
          });
      });

      tableRows.push(new TableRow({
          cantSplit: true,
          children: [
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: period, size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: "top", margins: compactCellMargins }),
              new TableCell({ children: employerCellChildren, verticalAlign: "top", margins: compactCellMargins }),
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cleanText(h.country || ""), size: 20 })], alignment: AlignmentType.CENTER })], verticalAlign: "top", margins: compactCellMargins }),
              new TableCell({ children: summaryCellChildren, verticalAlign: "top", margins: compactCellMargins }),
          ]
      }));
  });

  children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
      borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
          insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "000000" },
      }
  }));

  children.push(createSectionHeading(
      "Reference to Prior Work/Assignments that Best Illustrates Capability to Handle the Assigned\nTasks",
      { bottom: { color: "000000", space: 1, style: BorderStyle.SINGLE, size: 6 } },
  ));

  const adequacyItems = expert.adequacy_experience || [];
  adequacyItems.forEach((item: any, itemIndex: number) => {
      const af = [
          { label: "Period", val: item.period || "" },
          { label: "Country", val: item.country || "" },
          { label: "Position", val: item.position || "", isBold: true },
          { label: "Client", val: item.client || "" },
          { label: "Assignment", val: item.assignment || item.assignmentDescription || "", isBold: true },
      ].filter((f) => f.val);

      af.forEach((f, fieldIndex) => {
          const valParts = f.val.split('\n').filter(p => p.trim() !== '');
          const valRuns = [];
          
          if (valParts.length === 0) {
              valRuns.push(new TextRun({ text: "\t", bold: f.isBold || false, size: 22 }));
          } else {
              valParts.forEach((part, index) => {
                  let cleanedPart = part.trim();
                  // No artificial forcing of bullets. Let the CSV dictate it, except if we want to ensure it looks exactly like PDF.
                  // PDF doesn't have bullets, so if the CSV has them because of the prompt, we strip them if we want to match PDF strictly.
                  if (f.label === "Assignment") {
                      if (cleanedPart.startsWith('-') || cleanedPart.startsWith('•')) {
                          cleanedPart = cleanedPart.substring(1).trim();
                      }
                  }
                  
                  valRuns.push(new TextRun({ 
                      text: (index === 0 ? "\t" : "\t") + cleanedPart,
                      bold: f.isBold || false,
                      size: 22,
                      break: index > 0 ? 1 : undefined 
                  }));
              });
          }
          
          const startsNewRecord = itemIndex > 0 && fieldIndex === 0;
          children.push(new Paragraph({
              children: [
                  new TextRun({ text: f.label.padEnd(20, ' '), italics: true, size: 22 }),
                  ...valRuns
              ],
              border: startsNewRecord
                  ? { top: { color: "C8C8C8", space: 6, style: BorderStyle.SINGLE, size: 4 } }
                  : undefined,
              spacing: { before: startsNewRecord ? 120 : 0, after: 0 },
              keepLines: true,
              tabStops: [
                  { type: "left", position: 2000 }
              ]
          }));
      });
  });

  if (adequacyItems.length > 0) {
      children.push(new Paragraph({
          border: { bottom: { color: "C8C8C8", space: 1, style: BorderStyle.SINGLE, size: 4 } },
          spacing: { before: 40, after: 60 },
          keepNext: true,
      }));
  }

  let membersArrRaw = expert.professionalMembership || expert.memberships || expert.professional_associations || [];
  let membersArr = Array.isArray(membersArrRaw) ? membersArrRaw : typeof membersArrRaw === 'string' ? membersArrRaw.split(',').map(s => s.trim()) : [];
  if (membersArr.length > 0) {
      children.push(createSectionHeading("MEMBERSHIP IN PROFESSIONAL ASSOCIATIONS:"));
      membersArr.forEach((m: string) => {
          children.push(new Paragraph({ children: [new TextRun({ text: `- ${m}`, size: 22 })], spacing: compactBulletSpacing, keepLines: true }));
      });
  }

  let langArrRaw = expert.languages || expert.metadata?.languages || [];
  let langArr = Array.isArray(langArrRaw) ? langArrRaw : typeof langArrRaw === 'string' ? langArrRaw.split(',').map(s => ({ name: s.trim() })) : [];
  if (langArr.length > 0) {
      children.push(createSectionHeading("LANGUAGE SKILLS:"));
      langArr.forEach((l: any) => {
          let lText = typeof l === "string" ? l : (l.name || "");
          if (l.level) lText += `: ${l.level}`;
          children.push(new Paragraph({ children: [new TextRun({ text: `- ${lText}`, size: 22 })], spacing: compactBulletSpacing, keepLines: true }));
      });
  }

  if (expert.email || expert.phone) {
      children.push(new Paragraph({
          children: [
              new TextRun({ text: "EXPERT'S CONTACT INFORMATION :", bold: true, size: 22 }),
              new TextRun({ text: ` (e-mail : ${cleanText(expert.email)}, phone ${cleanText(expert.phone)})`, size: 22 }),
          ],
          spacing: { before: 160, after: 60 },
          keepLines: true,
      }));
  }

  const expertNameUpper = cleanText(expert.fullName || expert.name).toUpperCase();
  const repName = cleanText(certification?.repName || "").toUpperCase();

  const createSignatureImage = (dataUrl?: string) => {
    if (!dataUrl) return null;

    const match = dataUrl.match(/^data:image\/(png|jpe?g);base64,(.+)$/i);
    if (!match) return null;

    const imageType = match[1].toLowerCase() === "jpeg"
      ? "jpg"
      : match[1].toLowerCase() as "png" | "jpg" | "gif" | "bmp";
    const binary = atob(match[2]);
    const data = Uint8Array.from(binary, (character) => character.charCodeAt(0));

    return new ImageRun({
      type: imageType,
      data,
      transformation: {
        width: 140,
        height: 40,
      },
    });
  };
  
  const createSignatureBlock = (
    name: string,
    roleLine1: string,
    roleLine2 = "",
    signatureBase64?: string,
    signatureDate?: string,
  ) => {
    const signatureImage = createSignatureImage(signatureBase64);
    const signatureLineBorder = {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "A0A0A0" },
    };

    return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            bottom: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            left: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            right: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideHorizontal: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
            insideVertical: { style: BorderStyle.NONE, size: 0, color: "FFFFFF" },
        },
        rows: [
            new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({ 
                        children: [new Paragraph({ children: [new TextRun({ text: name, size: 22 })] })], 
                        verticalAlign: "bottom",
                        width: { size: 44, type: WidthType.PERCENTAGE },
                        borders: signatureLineBorder,
                        margins: compactCellMargins,
                    }),
                    new TableCell({ 
                        children: [
                          new Paragraph({
                            children: signatureImage ? [signatureImage] : [],
                            alignment: AlignmentType.LEFT,
                          }),
                        ],
                        verticalAlign: "bottom",
                        width: { size: 44, type: WidthType.PERCENTAGE },
                        borders: signatureLineBorder,
                        margins: compactCellMargins,
                    }),
                    new TableCell({ 
                        children: [new Paragraph({ children: [new TextRun({ text: formatCertificationDate(signatureDate), size: 22 })] })], 
                        verticalAlign: "bottom",
                        width: { size: 12, type: WidthType.PERCENTAGE },
                        borders: signatureLineBorder,
                        margins: compactCellMargins,
                    }),
                ]
            }),
            new TableRow({
                cantSplit: true,
                children: [
                    new TableCell({ 
                        children: [
                          new Paragraph({
                            children: [new TextRun({ text: roleLine1, size: 22 })],
                            spacing: { after: 0 },
                          }),
                          ...(roleLine2 ? [
                            new Paragraph({
                              children: [new TextRun({ text: roleLine2, size: 22 })],
                              spacing: { after: 0 },
                            }),
                          ] : []),
                        ],
                        margins: compactCellMargins,
                    }),
                    new TableCell({ 
                        children: [new Paragraph({ children: [new TextRun({ text: "Signature", size: 22 })] })],
                        margins: compactCellMargins,
                    }),
                    new TableCell({ 
                        children: [new Paragraph({ children: [new TextRun({ text: "Date", size: 22 })] })],
                        margins: compactCellMargins,
                    }),
                ]
            }),
        ]
    });
  };

  if (certification?.show !== false) {
    children.push(createSectionHeading("CERTIFICATION:"));
    children.push(new Paragraph({
        children: [new TextRun({ text: "I, the undersigned, certify that to the best of my knowledge and belief, this CV correctly describes myself, my qualifications, and my experience, and I am available to undertake the assignment in case of an award. I understand that any misstatement or misrepresentation described herein may lead to my disqualification or dismissal by the Client, and/or sanctions by the Bank.", size: 22 })],
        alignment: AlignmentType.JUSTIFIED,
        spacing: { after: 120 }
    }));
    children.push(createSignatureBlock(
      expertNameUpper,
      "Name of Expert",
      "",
      certification?.expertSignatureBase64,
      certification?.expertSignatureDate,
    ));
    children.push(new Paragraph({ spacing: { after: 120 }, keepNext: true }));
    children.push(createSignatureBlock(
      repName,
      "Name of authorized",
      "Representative of the Consultant",
      certification?.repSignatureBase64,
      certification?.repSignatureDate,
    ));
  }


  const doc = new Document({
    styles: {
      default: {
        document: {
          run: {
            font: "Calibri",
          },
        },
      },
    },
    sections: [
      {
        properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
        headers: { default: header },
        footers: { default: footer },
        children: children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  if (download) {
    saveAs(blob, `${cleanText(expert.fullName || expert.name)}_CV.docx`);
  }
  return blob;
}
