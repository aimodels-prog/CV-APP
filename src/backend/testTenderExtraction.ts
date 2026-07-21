import dotenv from "dotenv";
import { runParseTenderText } from "./ai.ts";

dotenv.config();

const text = `--- TENDER DOC: staffing.pdf ---
--- PAGE 1 ---
REQUEST FOR PROPOSALS
Client: National Infrastructure Authority
Project: Municipal Infrastructure Supervision Services
Country: Oman
Status: OPEN

STAFFING SCHEDULE - REQUIRED PERSONNEL
Code\tKey/Non-Key\tPosition\tNo. Required
K-1\tKey Expert\tTeam Leader\t1
K-2\tKey Expert\tResident Engineer\t1
K-3\tKey Expert\tHighway Engineer\t2
K-4\tKey Expert\tBridge Engineer\t1
K-5\tKey Expert\tQuantity Surveyor\t1
NKE-1\tNon-Key Expert\tEnvironmental Specialist\t1
NKE-2\tNon-Key Expert\tLand Surveyor\t3
NKE-3\tNon-Key Expert\tMaterials Technician\t4
NKE-4\tNon-Key Expert\tCAD Operator\t2

Client contact: Procurement Manager. Proposals must be signed by the Consultant's Authorized Representative.
The Client's Project Director and evaluation committee will review submissions.
The consultant will supervise the Contractor's Site Manager, Safety Officer, and construction workforce. These contractor personnel are not part of the consultant staffing schedule.
Form TECH-6 includes a blank sample CV title "Water Engineer" for formatting illustration only.

--- PAGE 2 ---
Team Leader: Bachelor degree in Civil Engineering, minimum 15 years general experience and 10 years managing road supervision assignments. Leads the team and reports to the Client.
Resident Engineer: Bachelor degree in Civil Engineering, minimum 12 years general experience and 8 years supervising highway construction. Manages daily site supervision.
Highway Engineer: Bachelor degree in Civil Engineering, minimum 10 years general experience and 7 years highway design or construction experience. Reviews road works.
Bridge Engineer: Bachelor degree in Structural or Civil Engineering, minimum 10 years general experience and 6 years bridge experience. Reviews structures.
Quantity Surveyor: Bachelor degree in Quantity Surveying, minimum 8 years general experience and 5 years measurement and contract administration. Certifies quantities.
Environmental Specialist: Bachelor degree in Environmental Science, minimum 8 years general experience and 5 years infrastructure environmental compliance. Monitors safeguards.
Land Surveyor: Diploma or Bachelor degree in Surveying, minimum 7 years general experience and 5 years road surveying. Performs setting out and verification.
Materials Technician: Technical Diploma, minimum 5 years general experience and 3 years materials testing on road projects. Performs laboratory and field tests.
CAD Operator: Diploma in Drafting, minimum 4 years general experience and 2 years producing road drawings using AutoCAD. Prepares as-built drawings.
`;

async function run() {
  const result = await runParseTenderText(text);
  const titles = (result.positions || []).map(
    (position: any) => position.position_title,
  );
  const forbiddenTitles = [
    "Procurement Manager",
    "Authorized Representative",
    "Project Director",
    "Site Manager",
    "Safety Officer",
    "Water Engineer",
  ];
  if (titles.length !== 9 || forbiddenTitles.some((title) => titles.includes(title))) {
    throw new Error(
      `Expected 9 real positions and no distractors, received ${titles.length}: ${titles.join(", ")}`,
    );
  }
  console.log({ ok: true, count: titles.length, titles });
}

run().catch((error) => {
  console.error("Tender extraction test failed:", error);
  process.exitCode = 1;
});
