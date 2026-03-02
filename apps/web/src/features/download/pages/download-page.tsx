import { useEffect } from "react";
import { Button } from "@valet/ui/components/button";
import { Badge } from "@valet/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@valet/ui/components/card";
import { Download, Shield, Cpu, RefreshCw } from "lucide-react";
import { PublicHeader } from "../../landing/components/public-header";
import { PublicFooter } from "../../landing/components/public-footer";
import { api } from "@/lib/api-client";

export function DownloadPage() {
  useEffect(() => {
    document.title = "Download GhostHands - WeKruit Valet";
  }, []);

  const { data, isLoading, isError, refetch } = api.desktopRelease.latest.useQuery({
    queryKey: ["desktop-release", "latest"],
    queryData: {},
    staleTime: 1000 * 60 * 5,
  });

  const release = data?.status === 200 ? data.body : null;
  const isNotFound = data !== undefined && data.status !== 200;

  return (
    <div className="min-h-screen bg-[var(--wk-surface-page)]">
      <PublicHeader />

      {/* Hero */}
      <section className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[var(--wk-content-width)] text-center">
          {release && (
            <Badge variant="default" className="mb-4">
              v{release.version} &middot; macOS
            </Badge>
          )}
          <h1 className="wk-display-lg mt-4 text-[var(--wk-text-primary)]">Download GhostHands</h1>
          <p className="wk-body-lg mx-auto mt-6 max-w-2xl text-[var(--wk-text-secondary)]">
            The GhostHands desktop app automates job applications directly from your Mac.
          </p>
        </div>
      </section>

      {/* Download Cards */}
      <section className="border-t border-[var(--wk-border-subtle)] bg-[var(--wk-surface-raised)] px-6 py-20 md:py-24">
        <div className="mx-auto max-w-[var(--wk-content-width)]">
          {isLoading && (
            <div className="flex justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[var(--wk-border-subtle)] border-t-[var(--wk-accent-amber)]" />
            </div>
          )}

          {isNotFound && (
            <div className="text-center">
              <p className="text-[var(--wk-text-secondary)]">
                No release available yet. Check back soon.
              </p>
            </div>
          )}

          {isError && (
            <div className="text-center space-y-4">
              <p className="text-[var(--wk-text-secondary)]">
                Unable to load download info. Please try again.
              </p>
              <Button variant="secondary" onClick={() => refetch()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry
              </Button>
            </div>
          )}

          {release && (
            <div className="mx-auto max-w-2xl space-y-8">
              <div className="grid gap-6 md:grid-cols-2">
                {/* Apple Silicon (ARM64) */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-xl)] bg-[var(--wk-surface-sunken)]">
                        <Cpu className="h-5 w-5 text-[var(--wk-accent-amber)]" />
                      </div>
                      <CardTitle>Apple Silicon</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-[var(--wk-text-secondary)]">
                      For Macs with M1, M2, M3, or M4 chips
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-[var(--wk-text-tertiary)]">
                      <span>macOS 12+</span>
                      <span>&middot;</span>
                      <span>.dmg</span>
                    </div>
                    <Button asChild variant="cta" className="w-full">
                      <a href={release.dmgArm64Url}>
                        <Download className="mr-2 h-4 w-4" />
                        Download for Apple Silicon
                      </a>
                    </Button>
                  </CardContent>
                </Card>

                {/* Intel (x64) — only shown when available */}
                {release.dmgX64Url && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-[var(--wk-radius-xl)] bg-[var(--wk-surface-sunken)]">
                          <Cpu className="h-5 w-5 text-[var(--wk-accent-amber)]" />
                        </div>
                        <CardTitle>Intel</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <p className="text-sm text-[var(--wk-text-secondary)]">
                        For Macs with Intel processors
                      </p>
                      <div className="flex flex-wrap gap-2 text-xs text-[var(--wk-text-tertiary)]">
                        <span>macOS 10.15+</span>
                        <span>&middot;</span>
                        <span>.dmg</span>
                      </div>
                      <Button asChild variant="secondary" className="w-full">
                        <a href={release.dmgX64Url}>
                          <Download className="mr-2 h-4 w-4" />
                          Download for Intel
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>

              <p className="text-center text-xs text-[var(--wk-text-tertiary)]">
                Not sure which version? Click the Apple menu &rarr; About This Mac. If you see
                "Chip: Apple M1/M2/M3/M4", choose Apple Silicon. Otherwise, choose Intel.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Installation Instructions */}
      <section className="border-t border-[var(--wk-border-subtle)] px-6 py-20 md:py-24">
        <div className="mx-auto max-w-[var(--wk-narrow-width)]">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-[var(--wk-accent-amber)]" />
            <h2 className="font-display text-xl font-semibold text-[var(--wk-text-primary)]">
              Installation Notes
            </h2>
          </div>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--wk-text-secondary)]">
            <p>
              GhostHands is not yet signed with an Apple Developer certificate. macOS Gatekeeper
              will show a warning the first time you open the app. To bypass this:
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Open the <strong>.dmg</strong> file and drag GhostHands to your Applications folder.
              </li>
              <li>Try to open GhostHands. macOS will block it and show a warning.</li>
              <li>
                Go to <strong>System Settings &rarr; Privacy &amp; Security</strong>.
              </li>
              <li>
                Scroll down and click <strong>"Open Anyway"</strong> next to the GhostHands message.
              </li>
              <li>
                Confirm by clicking <strong>"Open"</strong> in the dialog.
              </li>
            </ol>
            <p>You only need to do this once. Future launches will work normally.</p>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
