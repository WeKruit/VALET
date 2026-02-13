import { createDatabase } from "./client.js";
import { users, tasks, resumes, qaBank, consentRecords } from "./schema/index.js";

const DATABASE_URL =
  process.env["DATABASE_URL"] ?? "postgres://wekruit:wekruit_dev@localhost:5432/wekruit";

async function seed() {
  console.log("Seeding database...");
  const { db, sql } = createDatabase(DATABASE_URL);

  // Clean existing data
  await db.delete(consentRecords);
  await db.delete(qaBank);
  await db.delete(tasks);
  await db.delete(resumes);
  await db.delete(users);

  // Create test users
  const [user1, user2] = await db
    .insert(users)
    .values([
      {
        email: "alex@example.com",
        name: "Alex Developer",
        googleId: "google-test-001",
        phone: "+1 555-123-4567",
        location: "San Francisco, CA",
        linkedinUrl: "https://linkedin.com/in/alexdev",
        skills: JSON.parse('["TypeScript", "React", "Node.js", "PostgreSQL"]'),
        workHistory: JSON.parse(
          '[{"company":"Acme Corp","title":"Senior Software Engineer","startDate":"2022-01","endDate":null}]',
        ),
        education: JSON.parse(
          '[{"school":"UC Berkeley","degree":"B.S. Computer Science","startDate":"2014-08","endDate":"2018-05"}]',
        ),
        subscriptionTier: "starter",
      },
      {
        email: "sam@example.com",
        name: "Sam Engineer",
        googleId: "google-test-002",
        phone: "+1 555-987-6543",
        location: "New York, NY",
        skills: JSON.parse('["Python", "AWS", "Docker", "Kubernetes"]'),
        subscriptionTier: "free",
      },
    ])
    .returning();

  if (!user1 || !user2) throw new Error("Failed to create seed users");

  // Create resumes
  const [resume1] = await db
    .insert(resumes)
    .values([
      {
        userId: user1.id,
        filename: "alex-developer-resume.pdf",
        fileKey: "resumes/test-001.pdf",
        fileSizeBytes: 245_000,
        mimeType: "application/pdf",
        isDefault: true,
        status: "parsed",
        parsingConfidence: 0.95,
        parsedAt: new Date(),
      },
    ])
    .returning();

  if (!resume1) throw new Error("Failed to create seed resume");

  // Create sample tasks
  await db.insert(tasks).values([
    {
      userId: user1.id,
      jobUrl: "https://www.linkedin.com/jobs/view/1234567890",
      platform: "linkedin",
      status: "completed",
      mode: "copilot",
      resumeId: resume1.id,
      jobTitle: "Senior Frontend Engineer",
      companyName: "TechCorp",
      progress: 100,
      confidenceScore: 0.92,
      fieldsFilled: 12,
      durationSeconds: 45,
      completedAt: new Date(),
    },
    {
      userId: user1.id,
      jobUrl: "https://www.linkedin.com/jobs/view/9876543210",
      platform: "linkedin",
      status: "in_progress",
      mode: "copilot",
      resumeId: resume1.id,
      jobTitle: "Full Stack Developer",
      companyName: "StartupXYZ",
      progress: 60,
      currentStep: "filling_form",
    },
    {
      userId: user1.id,
      jobUrl: "https://boards.greenhouse.io/example/jobs/123",
      platform: "greenhouse",
      status: "failed",
      mode: "copilot",
      resumeId: resume1.id,
      jobTitle: "Backend Engineer",
      companyName: "BigCo",
      errorCode: "CAPTCHA_TIMEOUT",
      errorMessage: "CAPTCHA challenge timed out after 120 seconds",
    },
    {
      userId: user2.id,
      jobUrl: "https://www.linkedin.com/jobs/view/1111111111",
      platform: "linkedin",
      status: "created",
      mode: "copilot",
      jobTitle: "DevOps Engineer",
      companyName: "CloudInc",
    },
    {
      userId: user2.id,
      jobUrl: "https://jobs.lever.co/example/abc-def",
      platform: "lever",
      status: "queued",
      mode: "copilot",
      jobTitle: "SRE",
      companyName: "ReliableCo",
    },
  ]);

  // Create Q&A bank entries
  await db.insert(qaBank).values([
    {
      userId: user1.id,
      category: "work_authorization",
      question: "Are you authorized to work in the United States?",
      answer: "Yes",
      usageMode: "always_use",
      source: "user_input",
    },
    {
      userId: user1.id,
      category: "work_authorization",
      question: "Do you require visa sponsorship?",
      answer: "No",
      usageMode: "always_use",
      source: "user_input",
    },
    {
      userId: user1.id,
      category: "experience",
      question: "How many years of professional experience do you have?",
      answer: "6 years",
      usageMode: "always_use",
      source: "resume_inferred",
    },
    {
      userId: user1.id,
      category: "availability",
      question: "When can you start?",
      answer: "2 weeks notice",
      usageMode: "ask_each_time",
      source: "user_input",
    },
  ]);

  // Create consent records
  await db.insert(consentRecords).values([
    {
      userId: user1.id,
      type: "tos_acceptance",
      version: "1.0",
      ipAddress: "127.0.0.1",
      userAgent: "seed-script",
    },
    {
      userId: user1.id,
      type: "copilot_disclaimer",
      version: "1.0",
      ipAddress: "127.0.0.1",
      userAgent: "seed-script",
    },
  ]);

  console.log("Seed complete:");
  console.log("  - 2 users");
  console.log("  - 1 resume");
  console.log("  - 5 tasks");
  console.log("  - 4 Q&A bank entries");
  console.log("  - 2 consent records");

  await sql.end();
  process.exit(0);
}

seed().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
