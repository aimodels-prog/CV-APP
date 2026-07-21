import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
// @ts-ignore
import pdfWorker from "pdfjs-dist/build/pdf.worker.mjs?url";
import * as mammoth from "mammoth";
import { postgresApi } from "./postgresApi";

GlobalWorkerOptions.workerSrc = pdfWorker;

interface TextExtractionOptions {
  preserveLayout?: boolean;
}

function extractPositionedPageText(items: any[]): string {
  const lines: Array<{
    y: number;
    items: Array<{ x: number; text: string }>;
  }> = [];
  for (const item of items) {
    const text = String(item?.str || "").trim();
    if (!text) continue;
    const x = Number(item?.transform?.[4] || 0);
    const y = Number(item?.transform?.[5] || 0);
    let line = lines.find((candidate) => Math.abs(candidate.y - y) <= 2);
    if (!line) {
      line = { y, items: [] };
      lines.push(line);
    }
    line.items.push({ x, text });
  }
  return lines
    .sort((a, b) => b.y - a.y)
    .map((line) =>
      line.items
        .sort((a, b) => a.x - b.x)
        .map((item) => item.text)
        .join("\t"),
    )
    .join("\n");
}

export async function extractTextFromPDF(
  file: File,
  options: TextExtractionOptions = {},
): Promise<string> {
  const fileExt = file.name.split(".").pop()?.toLowerCase();
  const arrayBuffer = await file.arrayBuffer();
  if (fileExt === "docx") {
    try {
      const result = await mammoth.extractRawText({ arrayBuffer });
      return result.value;
    } catch (error) {
      console.error("Failed to parse DOCX:", error);
      throw new Error("Unable to parse DOCX file layout.");
    }
  }
  if (fileExt === "pdf") {
    try {
      const pdf = await getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const textContent = await page.getTextContent();
        const pageText = options.preserveLayout
          ? extractPositionedPageText(textContent.items)
          : textContent.items.map((item: any) => item.str).join(" ");
        fullText += options.preserveLayout
          ? `--- PAGE ${pageNumber} ---\n${pageText}\n`
          : `${pageText}\n`;
      }
      return fullText;
    } catch (error) {
      console.error("Failed to parse PDF:", error);
      throw new Error("Unable to parse PDF file.");
    }
  }
  return new TextDecoder("utf-8").decode(arrayBuffer);
}

/** Stage 6: PostgreSQL is the only runtime persistence engine. */
export const api = postgresApi;
export const activeDataBackend = "postgresql" as const;
