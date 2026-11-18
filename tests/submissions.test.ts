import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

interface StoredCookie {
  value: string;
  options: Record<string, unknown>;
}

const mockState = vi.hoisted(() => ({
  cookieJar: new Map<string, StoredCookie>(),
  requestHeaders: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => {
      const entry = mockState.cookieJar.get(name);
      return entry ? { name, value: entry.value } : undefined;
    },
    set: (name: string, value: string, options: Record<string, unknown> = {}) => {
      mockState.cookieJar.set(name, { value, options });
    },
    delete: (name: string) => {
      mockState.cookieJar.delete(name);
    },
  }),
  headers: async () => new Headers(Array.from(mockState.requestHeaders.entries())),
}));

import {
  buildEmptySleCrfRecord,
  calculateBmi,
  type SleCrfPatientRecord,
} from "@/data/crfData";
import { DEMO_USERS } from "@/data/mockData";
import { seedDatabase } from "@/db/seed";
import { POST as loginPost } from "@/app/api/auth/login/route";
import {
  GET as submissionsGet,
  POST as submissionsPost,
} from "@/app/api/submissions/route";
import { PATCH as submissionPatch } from "@/app/api/submissions/[id]/route";
import { generateClinicalReportPdfBytes } from "@/lib/originalFileGenerator";
import {
  DEFAULT_PAGE_SIZE,
  formatDateInOffset,
  formatTimestampInOffset,
} from "@/lib/submissionFilters";
import {
  createTestDatabase,
  type TestDatabaseHandle,
} from "./helpers/pgliteTestDb";

function buildRequest(
  path: string,
  method: "GET" | "POST" | "PATCH",
  body?: unknown
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      Host: "localhost:3000",
      Origin: "http://localhost:3000",
      "Sec-Fetch-Site": "same-origin",
      "X-Forwarded-For": "10.20.30.40",
      "User-Agent": "Vitest-Submissions-Suite/1.0",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

async function signInAs(role: "specialist" | "patient") {
  const persona = DEMO_USERS[role];
  const res = await loginPost(
    buildRequest("/api/auth/login", "POST", {
      email: persona.email,
      password: persona.passwordHint,
      selectedRole: role,
      consentChecked: true,
    })
  );
  expect(res.status).toBe(200);
}

interface SubmissionsResponseBody {
  items: Array<{
    record: SleCrfPatientRecord;
    dbSubmissionId: string;
    submittedAtIso: string;
    ocrSummary: {
      manualCount: number;
      verifyCount: number;
      approvedCount: number;
      totalOcrItems: number;
    };
  }>;
  stats: {
    total: number;
    pending: number;
    approved: number;
    manualRequiredDossiers: number;
    filteredTotal: number;
  };
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
  roleScope: "specialist" | "patient";
}

describe("Lupiva Server-Side Submissions Filter & Upload API (Zero Mock Data)", () => {
  let testDb: TestDatabaseHandle;

  beforeAll(async () => {
    testDb = await createTestDatabase();
  });

  beforeEach(async () => {
    mockState.cookieJar.clear();
    mockState.requestHeaders.clear();
    await testDb.resetTables();
    await seedDatabase(testDb.db);
  });

  afterAll(async () => {
    await testDb.close();
  });

  it("formats dates and timestamps in DD/MM/YYYY and DD/MM/YYYY HH:mm for the caller offset", () => {
    const sampleUtc = new Date("2026-11-16T09:10:00Z"); // 16:10 ICT (UTC+7)
    expect(formatDateInOffset(sampleUtc, 420)).toBe("16/11/2026");
    expect(formatTimestampInOffset(sampleUtc, 420)).toBe("16/11/2026 16:10");
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await submissionsGet(buildRequest("/api/submissions", "GET"));
    expect(res.status).toBe(401);
  });

  it("returns zero mock dossiers to specialist and patient before real submissions exist", async () => {
    await signInAs("specialist");
    const specRes = await submissionsGet(
      buildRequest("/api/submissions?utcOffsetMinutes=420", "GET")
    );
    expect(specRes.status).toBe(200);
    const specData = (await specRes.json()) as SubmissionsResponseBody;
    expect(specData.roleScope).toBe("specialist");
    expect(specData.stats.total).toBe(0);
    expect(specData.items).toHaveLength(0);

    mockState.cookieJar.clear();
    await signInAs("patient");
    const patRes = await submissionsGet(
      buildRequest("/api/submissions?utcOffsetMinutes=420", "GET")
    );
    expect(patRes.status).toBe(200);
    const patData = (await patRes.json()) as SubmissionsResponseBody;
    expect(patData.roleScope).toBe("patient");
    expect(patData.stats.total).toBe(0);
    expect(patData.items).toHaveLength(0);
  });

  it("auto-calculates BMI and generates valid native PDF bytes for uploaded files", () => {
    expect(calculateBmi("158", "51.5")).toBe("20.6");
    expect(calculateBmi("170", "65")).toBe("22.5");
    expect(calculateBmi("", "50")).toBe("—");

    const samplePatient = buildEmptySleCrfRecord({
      id: "crf-up-test1",
      studyId: "VN-1001-26",
      patientName: "Tran Thi Mai",
    });
    const sampleFile = {
      id: "file-1",
      name: "Lab_Panel.pdf",
      url: null,
      isImage: false,
    };
    const pdfBytes = generateClinicalReportPdfBytes(samplePatient, sampleFile);
    const pdfText = new TextDecoder().decode(pdfBytes);
    expect(pdfText.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdfText).toContain(sampleFile.name);
    expect(pdfText).toContain(samplePatient.studyId);
    expect(pdfText.trim().endsWith("%%EOF")).toBe(true);
  });

  it("paginates, searches, and filters real submissions across patient and specialist roles", async () => {
    expect(DEFAULT_PAGE_SIZE).toBe(10);
    await signInAs("patient");

    const uploadedNames = [
      "Patient_Real_Upload_1.pdf",
      "Patient_Real_Upload_2.jpg",
      "Patient_Real_Upload_3.jpg",
    ];
    for (const fileName of uploadedNames) {
      const postRes = await submissionsPost(
        buildRequest("/api/submissions", "POST", {
          patientName: DEMO_USERS.patient.name,
          utcOffsetMinutes: 420,
          files: [
            {
              name: fileName,
              mimeType: fileName.endsWith(".pdf") ? "application/pdf" : "image/jpeg",
              sizeBytes: 42000,
              isImage: !fileName.endsWith(".pdf"),
            },
          ],
        })
      );
      expect(postRes.status).toBe(201);
    }

    // Patient pagination newest-first
    const res = await submissionsGet(
      buildRequest("/api/submissions?page=1&pageSize=2", "GET")
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as SubmissionsResponseBody;
    expect(data.roleScope).toBe("patient");
    expect(data.pagination).toEqual({
      page: 1,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    });
    expect(data.items.map((i) => i.record.uploadedFiles?.[0]?.name)).toEqual([
      "Patient_Real_Upload_3.jpg",
      "Patient_Real_Upload_2.jpg",
    ]);

    // Switch to specialist and verify search + pending filter
    mockState.cookieJar.clear();
    await signInAs("specialist");

    const pendingRes = await submissionsGet(
      buildRequest(
        "/api/submissions?status=pending_doctor_review&page=1&pageSize=2",
        "GET"
      )
    );
    const pendingData = (await pendingRes.json()) as SubmissionsResponseBody;
    expect(pendingData.stats.total).toBe(3);
    expect(pendingData.stats.pending).toBe(3);
    expect(pendingData.pagination.totalPages).toBe(2);

    const searchRes = await submissionsGet(
      buildRequest("/api/submissions?q=Patient_Real_Upload_2", "GET")
    );
    const searchData = (await searchRes.json()) as SubmissionsResponseBody;
    expect(searchData.items).toHaveLength(1);
    expect(searchData.items[0].record.uploadedFiles?.[0]?.name).toBe(
      "Patient_Real_Upload_2.jpg"
    );
  });

  it("persists patient upload via POST /api/submissions and reflects approval via PATCH /api/submissions/[id]", async () => {
    await signInAs("patient");

    const createRes = await submissionsPost(
      buildRequest("/api/submissions", "POST", {
        patientName: DEMO_USERS.patient.name,
        utcOffsetMinutes: 420,
        files: [
          {
            name: "Today_Uploaded_Lab_Panel.pdf",
            mimeType: "application/pdf",
            sizeBytes: 120400,
            isImage: false,
          },
        ],
      })
    );
    expect(createRes.status).toBe(201);
    const created = (await createRes.json()) as SubmissionsResponseBody["items"][number];
    expect(created.record.submissionStatus).toBe("pending_doctor_review");

    // Patient cannot PATCH approval status (403 Forbidden)
    const forbiddenPatch = await submissionPatch(
      buildRequest(
        `/api/submissions/${encodeURIComponent(created.record.id)}`,
        "PATCH",
        {
          record: {
            ...created.record,
            submissionStatus: "approved",
            signedOffBy: "Fake Doctor",
          },
        }
      ),
      { params: Promise.resolve({ id: created.record.id }) }
    );
    expect(forbiddenPatch.status).toBe(403);

    // Switch to specialist: new upload shows up immediately under status=pending_doctor_review
    mockState.cookieJar.clear();
    await signInAs("specialist");

    const pendingRes = await submissionsGet(
      buildRequest(
        "/api/submissions?status=pending_doctor_review&utcOffsetMinutes=420",
        "GET"
      )
    );
    const pendingData = (await pendingRes.json()) as SubmissionsResponseBody;
    expect(
      pendingData.items.some((i) => i.record.id === created.record.id)
    ).toBe(true);

    // Specialist approves the submission via PATCH
    const patchRes = await submissionPatch(
      buildRequest(
        `/api/submissions/${encodeURIComponent(created.record.id)}`,
        "PATCH",
        {
          record: {
            ...created.record,
            submissionStatus: "approved",
            signedOffBy: DEMO_USERS.specialist.name,
            signedOffRole: "specialist",
          },
          utcOffsetMinutes: 420,
        }
      ),
      { params: Promise.resolve({ id: created.record.id }) }
    );
    expect(patchRes.status).toBe(200);

    // Now filtering by status=approved returns the approved submission
    const approvedRes = await submissionsGet(
      buildRequest(
        "/api/submissions?status=approved&utcOffsetMinutes=420",
        "GET"
      )
    );
    const approvedData = (await approvedRes.json()) as SubmissionsResponseBody;
    expect(
      approvedData.items.some((i) => i.record.id === created.record.id)
    ).toBe(true);
  });
});
