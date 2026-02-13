import { randomUUID } from "node:crypto";

export interface ParsedResumeData {
  name: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  skills: string[];
  experience: {
    company: string;
    title: string;
    startDate: string;
    endDate: string | null;
    description: string;
  }[];
  education: {
    institution: string;
    degree: string;
    field: string;
    graduationDate: string;
  }[];
}

export interface Resume {
  id: string;
  userId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  parsedData: ParsedResumeData | null;
  isPrimary: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const DEFAULT_PARSED_DATA: ParsedResumeData = {
  name: "Alice Johnson",
  email: "alice@example.com",
  phone: "(555) 123-4567",
  location: "San Francisco, CA",
  summary: "Full-stack software engineer with 5 years of experience building web applications.",
  skills: ["TypeScript", "React", "Node.js", "PostgreSQL", "AWS", "Docker", "GraphQL"],
  experience: [
    {
      company: "TechCorp Inc.",
      title: "Senior Software Engineer",
      startDate: "2022-01",
      endDate: null,
      description: "Led development of microservices architecture serving 1M+ users.",
    },
    {
      company: "StartupXYZ",
      title: "Software Engineer",
      startDate: "2020-03",
      endDate: "2021-12",
      description: "Built React dashboard and Node.js API for real-time analytics platform.",
    },
    {
      company: "Acme Corp",
      title: "Junior Developer",
      startDate: "2019-06",
      endDate: "2020-02",
      description: "Developed internal tools and automated testing infrastructure.",
    },
  ],
  education: [
    {
      institution: "University of California, Berkeley",
      degree: "B.S.",
      field: "Computer Science",
      graduationDate: "2019-05",
    },
  ],
};

export const ResumeFactory = {
  create: (overrides?: Partial<Resume>): Resume => ({
    id: randomUUID(),
    userId: randomUUID(),
    filename: "alice-johnson-resume.pdf",
    mimeType: "application/pdf",
    sizeBytes: 245_760,
    storageKey: `resumes/${randomUUID()}.pdf`,
    parsedData: { ...DEFAULT_PARSED_DATA },
    isPrimary: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }),

  createUnparsed: (overrides?: Partial<Resume>): Resume =>
    ResumeFactory.create({
      parsedData: null,
      ...overrides,
    }),

  createMany: (count: number, overrides?: Partial<Resume>): Resume[] =>
    Array.from({ length: count }, (_, i) =>
      ResumeFactory.create({
        filename: `resume-${i + 1}.pdf`,
        isPrimary: i === 0,
        ...overrides,
      }),
    ),
};
