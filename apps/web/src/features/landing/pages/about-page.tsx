import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@valet/ui/components/button";
import { Target, Heart, Zap } from "lucide-react";
import { PublicHeader } from "../components/public-header";
import { PublicFooter } from "../components/public-footer";

const values = [
  {
    icon: Target,
    title: "Accuracy First",
    description:
      "Every application should represent you faithfully. Our AI matches your real experience to job requirements -- no hallucinated skills, no inflated titles.",
  },
  {
    icon: Heart,
    title: "Candidate-Centric",
    description:
      "Job searching is stressful enough. We build tools that respect your time, protect your data, and put you in control of every submission.",
  },
  {
    icon: Zap,
    title: "Responsible Automation",
    description:
      "Automation should augment human judgment, not replace it. Copilot mode keeps you in the loop. Autopilot mode earns your trust first.",
  },
];

export function AboutPage() {
  useEffect(() => {
    document.title = "About - WeKruit Valet";
  }, []);

  return (
    <div className="min-h-screen bg-[var(--wk-surface-page)]">
      <PublicHeader />

      {/* Mission */}
      <section className="px-6 py-20 md:py-28">
        <div className="mx-auto max-w-[var(--wk-content-width)] text-center">
          <p className="wk-caption text-[var(--wk-accent-amber)]">Our Mission</p>
          <h1 className="wk-display-lg mt-4 text-[var(--wk-text-primary)]">
            Make applying for jobs as easy as finding them
          </h1>
          <p className="wk-body-lg mx-auto mt-6 max-w-2xl text-[var(--wk-text-secondary)]">
            Job boards made it easy to discover opportunities. But the
            application process hasn't changed in decades -- the same tedious
            forms, the same manual data entry, application after application.
            WeKruit Valet exists to fix that.
          </p>
        </div>
      </section>

      {/* Values */}
      <section className="border-t border-[var(--wk-border-subtle)] bg-[var(--wk-surface-raised)] px-6 py-20 md:py-24">
        <div className="mx-auto max-w-[var(--wk-max-width)]">
          <h2 className="wk-display-md text-center text-[var(--wk-text-primary)]">
            What we believe
          </h2>
          <div className="mt-14 grid gap-10 md:grid-cols-3">
            {values.map((value) => (
              <div key={value.title} className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[var(--wk-radius-xl)] bg-[var(--wk-surface-sunken)]">
                  <value.icon className="h-5 w-5 text-[var(--wk-accent-amber)]" />
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">
                  {value.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--wk-text-secondary)]">
                  {value.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Story */}
      <section className="border-t border-[var(--wk-border-subtle)] px-6 py-20 md:py-24">
        <div className="mx-auto max-w-[var(--wk-narrow-width)]">
          <h2 className="wk-display-md text-[var(--wk-text-primary)]">
            Why we built Valet
          </h2>
          <div className="mt-6 space-y-4 text-sm leading-relaxed text-[var(--wk-text-secondary)]">
            <p>
              We've been through the modern job search grind ourselves. Copy your
              work history into yet another ATS. Re-type your address for the
              hundredth time. Answer the same screening questions in slightly
              different formats. It's exhausting, repetitive, and it doesn't
              have to be this way.
            </p>
            <p>
              We built WeKruit Valet to automate the mechanical parts of
              applying so you can focus on the parts that actually matter --
              preparing for interviews, networking, and choosing the right role
              for your career.
            </p>
            <p>
              Our approach is different from bulk-apply tools. We prioritize
              quality over quantity. Every application is tailored to the
              specific job posting. You review everything in Copilot mode before
              it goes out. And when you're ready, Autopilot mode applies the
              same quality standards automatically.
            </p>
          </div>

          <div className="mt-12">
            <Button asChild size="lg" variant="cta">
              <Link to="/login">Try WeKruit Valet</Link>
            </Button>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
