import { Outlet } from "react-router-dom";
import { Sheet, SheetContent } from "@valet/ui/components/sheet";
import { Sidebar, SidebarContent } from "./sidebar";
import { Header } from "./header";
import { useUIStore } from "@/stores/ui.store";

export function AppLayout() {
  const { mobileSidebarOpen, setMobileSidebarOpen } = useUIStore();

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Skip to content link for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-[var(--wk-radius-md)] focus:bg-[var(--wk-surface-white)] focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-[var(--wk-shadow-lg)] focus:ring-2 focus:ring-[var(--wk-border-strong)]"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <Sidebar />

      {/* Mobile sidebar (sheet drawer) */}
      <Sheet open={mobileSidebarOpen} onOpenChange={setMobileSidebarOpen}>
        <SheetContent side="left" className="w-72 p-0 md:hidden" aria-describedby={undefined}>
          <SidebarContent
            collapsed={false}
            onNavigate={() => setMobileSidebarOpen(false)}
          />
        </SheetContent>
      </Sheet>

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />
        <main id="main-content" className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
