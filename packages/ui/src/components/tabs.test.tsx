import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, expect } from "vitest";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./tabs";

describe("Tabs", () => {
  function renderTabs(defaultValue = "tab1") {
    return render(
      <Tabs defaultValue={defaultValue}>
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          <TabsTrigger value="tab3">Tab 3</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Content for tab 1</TabsContent>
        <TabsContent value="tab2">Content for tab 2</TabsContent>
        <TabsContent value="tab3">Content for tab 3</TabsContent>
      </Tabs>
    );
  }

  it("renders all tab triggers", () => {
    renderTabs();
    expect(screen.getByRole("tab", { name: "Tab 1" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab 2" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab 3" })).toBeInTheDocument();
  });

  it("renders the tablist", () => {
    renderTabs();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
  });

  it("shows the default tab content", () => {
    renderTabs("tab1");
    expect(screen.getByText("Content for tab 1")).toBeInTheDocument();
  });

  it("marks the default tab as selected", () => {
    renderTabs("tab1");
    expect(screen.getByRole("tab", { name: "Tab 1" })).toHaveAttribute(
      "data-state",
      "active"
    );
  });

  it("switches content when clicking a different tab", async () => {
    const user = userEvent.setup();
    renderTabs("tab1");

    await user.click(screen.getByRole("tab", { name: "Tab 2" }));

    expect(screen.getByText("Content for tab 2")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Tab 2" })).toHaveAttribute(
      "data-state",
      "active"
    );
  });

  it("renders a disabled tab trigger", () => {
    render(
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Active</TabsTrigger>
          <TabsTrigger value="tab2" disabled>Disabled</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1">Active content</TabsContent>
        <TabsContent value="tab2">Disabled content</TabsContent>
      </Tabs>
    );

    expect(screen.getByRole("tab", { name: "Disabled" })).toBeDisabled();
  });

  it("supports keyboard navigation between tabs", async () => {
    const user = userEvent.setup();
    renderTabs("tab1");

    const tab1 = screen.getByRole("tab", { name: "Tab 1" });
    tab1.focus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Tab 2" })).toHaveFocus();

    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Tab 3" })).toHaveFocus();
  });

  it("has proper tabpanel role on content", () => {
    renderTabs("tab1");
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });
});
