import { render, screen } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { TaskList } from "./task-list";

// Mock the utils
vi.mock("@/lib/utils", () => ({
  formatRelativeTime: (date: string) => "2 hours ago",
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

const mockTasks = [
  {
    id: "task-1",
    jobUrl: "https://www.linkedin.com/jobs/view/111",
    platform: "LinkedIn",
    status: "in_progress",
    mode: "copilot" as const,
    progress: 65,
    currentStep: "filling",
    createdAt: "2026-02-12T10:00:00Z",
  },
  {
    id: "task-2",
    jobUrl: "https://boards.greenhouse.io/company/jobs/222",
    platform: "Greenhouse",
    status: "completed",
    mode: "autopilot" as const,
    progress: 100,
    currentStep: null,
    createdAt: "2026-02-11T08:00:00Z",
  },
  {
    id: "task-3",
    jobUrl: "https://jobs.lever.co/company/333",
    platform: "Lever",
    status: "waiting_human",
    mode: "copilot" as const,
    progress: 80,
    currentStep: "review",
    createdAt: "2026-02-12T12:00:00Z",
  },
  {
    id: "task-4",
    jobUrl: "https://www.linkedin.com/jobs/view/444",
    platform: "LinkedIn",
    status: "failed",
    mode: "copilot" as const,
    progress: 30,
    currentStep: null,
    createdAt: "2026-02-10T14:00:00Z",
  },
];

function renderTaskList(tasks = mockTasks) {
  return render(
    <MemoryRouter>
      <TaskList tasks={tasks} />
    </MemoryRouter>
  );
}

describe("TaskList", () => {
  // ─── Empty State ───

  it("renders empty state when no tasks", () => {
    renderTaskList([]);
    expect(screen.getByText("No tasks yet")).toBeInTheDocument();
    expect(
      screen.getByText("Start by applying to a job on the Apply page.")
    ).toBeInTheDocument();
  });

  // ─── Task Rendering ───

  it("renders all task items", () => {
    renderTaskList();
    expect(
      screen.getByText("https://www.linkedin.com/jobs/view/111")
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://boards.greenhouse.io/company/jobs/222")
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://jobs.lever.co/company/333")
    ).toBeInTheDocument();
    expect(
      screen.getByText("https://www.linkedin.com/jobs/view/444")
    ).toBeInTheDocument();
  });

  it("renders platform badges", () => {
    renderTaskList();
    const linkedInBadges = screen.getAllByText("LinkedIn");
    expect(linkedInBadges.length).toBe(2);
    expect(screen.getByText("Greenhouse")).toBeInTheDocument();
    expect(screen.getByText("Lever")).toBeInTheDocument();
  });

  it("renders mode badges", () => {
    renderTaskList();
    const copilotBadges = screen.getAllByText("copilot");
    expect(copilotBadges.length).toBe(3);
    expect(screen.getByText("autopilot")).toBeInTheDocument();
  });

  it("renders status badges", () => {
    renderTaskList();
    expect(screen.getByText("in progress")).toBeInTheDocument();
    expect(screen.getByText("completed")).toBeInTheDocument();
    expect(screen.getByText("waiting human")).toBeInTheDocument();
    expect(screen.getByText("failed")).toBeInTheDocument();
  });

  it("renders relative time for each task", () => {
    renderTaskList();
    const timeLabels = screen.getAllByText("2 hours ago");
    expect(timeLabels.length).toBe(4);
  });

  // ─── Progress Bar ───

  it("renders progress bar for in_progress tasks", () => {
    renderTaskList();
    expect(screen.getByText("65%")).toBeInTheDocument();
  });

  it("does not render progress bar for non-in_progress tasks", () => {
    renderTaskList([
      {
        id: "task-2",
        jobUrl: "https://boards.greenhouse.io/company/jobs/222",
        platform: "Greenhouse",
        status: "completed",
        mode: "autopilot" as const,
        progress: 100,
        currentStep: null,
        createdAt: "2026-02-11T08:00:00Z",
      },
    ]);
    expect(screen.queryByText("100%")).not.toBeInTheDocument();
  });

  // ─── Links ───

  it("renders links to task detail pages", () => {
    renderTaskList();
    const links = screen.getAllByRole("link");
    expect(links[0]).toHaveAttribute("href", "/tasks/task-1");
    expect(links[1]).toHaveAttribute("href", "/tasks/task-2");
    expect(links[2]).toHaveAttribute("href", "/tasks/task-3");
    expect(links[3]).toHaveAttribute("href", "/tasks/task-4");
  });

  // ─── Single Task ───

  it("renders a single task correctly", () => {
    renderTaskList([mockTasks[0]]);
    expect(
      screen.getByText("https://www.linkedin.com/jobs/view/111")
    ).toBeInTheDocument();
    expect(screen.getByText("copilot")).toBeInTheDocument();
    expect(screen.getByText("65%")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
  });
});
