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

import { INITIAL_CRF_PATIENTS, calculateBmi } from "@/data/crfData";
import { DEMO_USERS } from "@/data/mockData";
import { seedDatabase } from "@/db/seed";
import { POST as loginPost } from "@/app/api/auth/login/route";
import { GET as submissionsGet, POST as submissionsPost } from "@/app/api/submissions/route";
import { PATCH as submissionPatch } from "@/app/api/submissions/[id]/route";
import { requireAuth } from "@/lib/auth";
import { generateClinicalReportPdfBytes } from "@/lib/originalFileGenerator";
import {
  DEFAULT_PAGE_SIZE,
  formatDateInOffset,
  formatTimestampInOffset,
  submissionQuerySchema,
} from "@/lib/submissionFilters";
import { querySubmissions } from "@/lib/submissionsService";
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
    record: (typeof INITIAL_CRF_PATIENTS)[number];
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

describe("Lupiva Server-Side Submissions Filter & Upload API", () => {
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

  it("paginates all 12 seeded diverse patient dossiers on the backend (LIMIT/OFFSET) sorted newest-first", async () => {
    expect(INITIAL_CRF_PATIENTS.length).toBe(12);
    expect(DEFAULT_PAGE_SIZE).toBe(10);
    await signInAs("specialist");

    // Default page=1&pageSize=10 returns first 10 of 12 dossiers across 2 pages
    const defaultRes = await submissionsGet(
      buildRequest("/api/submissions?utcOffsetMinutes=420", "GET")
    );
    expect(defaultRes.status).toBe(200);
    const defaultData = (await defaultRes.json()) as SubmissionsResponseBody;
    expect(defaultData.roleScope).toBe("specialist");
    expect(defaultData.stats.total).toBe(12);
    expect(defaultData.stats.filteredTotal).toBe(12);
    expect(defaultData.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 12,
      totalPages: 2,
      hasPreviousPage: false,
      hasNextPage: true,
    });
    expect(defaultData.items).toHaveLength(10);

    // Explicit pageSize=5 returns first 5 of 12 dossiers across 3 pages
    const page1Res = await submissionsGet(
      buildRequest("/api/submissions?page=1&pageSize=5&utcOffsetMinutes=420", "GET")
    );
    expect(page1Res.status).toBe(200);
    const page1Data = (await page1Res.json()) as SubmissionsResponseBody;
    expect(page1Data.pagination).toEqual({
      page: 1,
      pageSize: 5,
      totalItems: 12,
      totalPages: 3,
      hasPreviousPage: false,
      hasNextPage: true,
    });
    expect(page1Data.items).toHaveLength(5);
    expect(page1Data.items[0].record.studyId).toBe("VN-0084-F2-26");
    expect(page1Data.items[0].record.submittedAt).toBe("16/11/2026 08:45");
    expect(page1Data.items[0].record.lastUpdated).toBe("16/11/2026 08:45 ICT");
    expect(
      page1Data.items.every((item) =>
        /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/.test(item.record.submittedAt ?? "")
      )
    ).toBe(true);
    // Ensure decrypted HIV field was rehydrated properly
    expect(
      page1Data.items[0].record.ocrFields.some((f) => f.code === "HIV-AGAB")
    ).toBe(true);

    // Page 2 returns items 6-10
    const page2Data = (await (
      await submissionsGet(
        buildRequest("/api/submissions?page=2&pageSize=5&utcOffsetMinutes=420", "GET")
      )
    ).json()) as SubmissionsResponseBody;
    expect(page2Data.pagination).toEqual({
      page: 2,
      pageSize: 5,
      totalItems: 12,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: true,
    });
    expect(page2Data.items).toHaveLength(5);

    // Page 3 returns remaining 2 items ending at 2026-10-05
    const page3Data = (await (
      await submissionsGet(
        buildRequest("/api/submissions?page=3&pageSize=5&utcOffsetMinutes=420", "GET")
      )
    ).json()) as SubmissionsResponseBody;
    expect(page3Data.pagination).toEqual({
      page: 3,
      pageSize: 5,
      totalItems: 12,
      totalPages: 3,
      hasPreviousPage: true,
      hasNextPage: false,
    });
    expect(page3Data.items).toHaveLength(2);
    expect(page3Data.items[1].record.studyId).toBe("VN-0131-26");

    // Out-of-range page clamps cleanly to last valid page (page 3)
    const clampedData = (await (
      await submissionsGet(
        buildRequest("/api/submissions?page=99&pageSize=5&utcOffsetMinutes=420", "GET")
      )
    ).json()) as SubmissionsResponseBody;
    expect(clampedData.pagination.page).toBe(3);
    expect(clampedData.items).toHaveLength(2);

    // Ensure no overlap across pages
    const allPaginatedIds = [
      ...page1Data.items,
      ...page2Data.items,
      ...page3Data.items,
    ].map((i) => i.record.studyId);
    expect(new Set(allPaginatedIds).size).toBe(12);
  });

  it("auto-calculates BMI from height & weight and generates valid native PDF bytes for original file download", () => {
    expect(calculateBmi("158", "51.5")).toBe("20.6");
    expect(calculateBmi("170", "65")).toBe("22.5");
    expect(calculateBmi("", "50")).toBe("—");

    const samplePatient = INITIAL_CRF_PATIENTS[0];
    const sampleFile = samplePatient.uploadedFiles![0];
    const pdfBytes = generateClinicalReportPdfBytes(samplePatient, sampleFile);
    const pdfText = new TextDecoder().decode(pdfBytes);
    expect(pdfText.startsWith("%PDF-1.4\n")).toBe(true);
    expect(pdfText).toContain(sampleFile.name);
    expect(pdfText).toContain(samplePatient.studyId);
    expect(pdfText.trim().endsWith("%%EOF")).toBe(true);
  });

  it("filters by custom uploaded date range and datePreset on the API", async () => {
    await signInAs("specialist");

    const rangeRes = await submissionsGet(
      buildRequest(
        "/api/submissions?datePreset=custom&fromDate=2026-11-13&toDate=2026-11-16&pageSize=10&utcOffsetMinutes=420",
        "GET"
      )
    );
    expect(rangeRes.status).toBe(200);
    const rangeData = (await rangeRes.json()) as SubmissionsResponseBody;
    expect(rangeData.items.map((i) => i.record.studyId)).toEqual([
      "VN-0084-F2-26",
      "VN-0105-26",
      "VN-0108-26",
      "VN-0111-26",
    ]);

    // Deterministic datePreset=today / last_7_days evaluation anchored at 2026-11-16 ICT
    const specialistUser = await requireAuth(["specialist"], testDb.db);
    const fixedNow = new Date("2026-11-16T10:30:00+07:00");

    const todayResult = await querySubmissions({
      user: specialistUser,
      filters: submissionQuerySchema.parse({
        datePreset: "today",
        pageSize: 10,
        utcOffsetMinutes: 420,
      }),
      now: fixedNow,
      db: testDb.db,
    });
    expect(todayResult.items.map((i) => i.record.studyId)).toEqual([
      "VN-0084-F2-26",
      "VN-0105-26",
    ]);

    const last7Result = await querySubmissions({
      user: specialistUser,
      filters: submissionQuerySchema.parse({
        datePreset: "last_7_days",
        pageSize: 10,
        utcOffsetMinutes: 420,
      }),
      now: fixedNow,
      db: testDb.db,
    });
    // Covers 2026-11-10 .. 2026-11-16 inclusive (6 dossiers)
    expect(last7Result.items.map((i) => i.record.studyId)).toEqual([
      "VN-0084-F2-26",
      "VN-0105-26",
      "VN-0108-26",
      "VN-0111-26",
      "VN-0114-26",
      "VN-0084-26",
    ]);
  });

  it("filters by submission status, clinical risk, sex, encrypted search, and paginates computed sorts", async () => {
    await signInAs("specialist");

    // 1. Filtered backend pagination on status=pending_doctor_review (7 pending -> 4 + 3 with pageSize=4)
    const pendingP1 = (await (
      await submissionsGet(
        buildRequest(
          "/api/submissions?status=pending_doctor_review&page=1&pageSize=4",
          "GET"
        )
      )
    ).json()) as SubmissionsResponseBody;
    expect(pendingP1.pagination).toMatchObject({
      page: 1,
      pageSize: 4,
      totalItems: 7,
      totalPages: 2,
      hasNextPage: true,
    });
    expect(pendingP1.items).toHaveLength(4);

    const pendingP2 = (await (
      await submissionsGet(
        buildRequest(
          "/api/submissions?status=pending_doctor_review&page=2&pageSize=4",
          "GET"
        )
      )
    ).json()) as SubmissionsResponseBody;
    expect(pendingP2.items).toHaveLength(3);

    // 2. Below EULAR/ACR <10 threshold
    const belowEularData = (await (
      await submissionsGet(
        buildRequest("/api/submissions?clinicalRisk=eular_below", "GET")
      )
    ).json()) as SubmissionsResponseBody;
    expect(belowEularData.items.map((i) => i.record.studyId)).toEqual([
      "VN-0123-26",
    ]);

    // 3. Sex filter (Male)
    const maleData = (await (
      await submissionsGet(
        buildRequest("/api/submissions?gender=Male&pageSize=10", "GET")
      )
    ).json()) as SubmissionsResponseBody;
    expect(maleData.items.every((i) => i.record.gender === "Male")).toBe(true);
    expect(maleData.items.map((i) => i.record.studyId)).toEqual([
      "VN-0105-26",
      "VN-0114-26",
      "VN-0102-26",
      "VN-0123-26",
    ]);

    // 4. Encrypted PII text search (`q`) on patientName / studyId
    const searchData = (await (
      await submissionsGet(
        buildRequest("/api/submissions?q=Nguyen%20Ngoc%20Lan", "GET")
      )
    ).json()) as SubmissionsResponseBody;
    expect(searchData.items).toHaveLength(1);
    expect(searchData.items[0].record.studyId).toBe("VN-0108-26");

    // 5. Paginated sort by oldest uploaded date (page 1 of size 2)
    const sortOldestData = (await (
      await submissionsGet(
        buildRequest("/api/submissions?sort=oldest&page=1&pageSize=2", "GET")
      )
    ).json()) as SubmissionsResponseBody;
    expect(sortOldestData.items.map((i) => i.record.studyId)).toEqual([
      "VN-0131-26",
      "VN-0127-26",
    ]);
    expect(sortOldestData.pagination.totalItems).toBe(12);
  });

  it("scopes patient view to their own submissions sorted newest-first and supports backend pagination", async () => {
    await signInAs("patient");

    // Even if doctor query params are passed, patient view enforces patient scope & upload-date sort
    const res = await submissionsGet(
      buildRequest(
        "/api/submissions?status=approved&sort=oldest&q=Le%20Van%20Hung&page=1&pageSize=2",
        "GET"
      )
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
    expect(data.items.map((i) => i.record.studyId)).toEqual([
      "VN-0084-F2-26",
      "VN-0084-26",
    ]);

    const page2Data = (await (
      await submissionsGet(
        buildRequest("/api/submissions?page=2&pageSize=2", "GET")
      )
    ).json()) as SubmissionsResponseBody;
    expect(page2Data.items.map((i) => i.record.studyId)).toEqual([
      "VN-0084-F1-26",
    ]);
    expect(
      page2Data.items.every((i) => i.record.patientName === DEMO_USERS.patient.name)
    ).toBe(true);
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

    // Switch to specialist: new upload shows up immediately under datePreset=today
    mockState.cookieJar.clear();
    await signInAs("specialist");

    const todayRes = await submissionsGet(
      buildRequest("/api/submissions?datePreset=today&utcOffsetMinutes=420", "GET")
    );
    const todayData = (await todayRes.json()) as SubmissionsResponseBody;
    expect(
      todayData.items.some((i) => i.record.id === created.record.id)
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

    // Now filtering by status=approved & datePreset=today returns the approved submission
    const approvedTodayRes = await submissionsGet(
      buildRequest(
        "/api/submissions?status=approved&datePreset=today&utcOffsetMinutes=420",
        "GET"
      )
    );
    const approvedTodayData =
      (await approvedTodayRes.json()) as SubmissionsResponseBody;
    expect(
      approvedTodayData.items.some((i) => i.record.id === created.record.id)
    ).toBe(true);
  });
});
