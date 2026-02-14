import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button } from "@valet/ui/components/button";
import { Card, CardContent } from "@valet/ui/components/card";
import { Badge } from "@valet/ui/components/badge";
import {
  Bot,
  MousePointerClick,
  Globe,
  FileText,
  Upload,
  Sparkles,
  Rocket,
  Shield,
  Quote,
} from "lucide-react";
import { PublicHeader } from "../components/public-header";
import { PublicFooter } from "../components/public-footer";

const features = [
  {
    icon: Bot,
    title: "AI-Powered Applications",
    description:
      "Smart form filling powered by large language models that understand job requirements and match them to your profile.",
  },
  {
    icon: MousePointerClick,
    title: "Copilot Mode",
    description:
      "Review every field before submission. Confidence scores and source indicators let you stay in control of every application.",
  },
  {
    icon: Globe,
    title: "Multi-Platform Support",
    description:
      "Apply across LinkedIn, Greenhouse, Lever, Workday, and more. One profile, every platform.",
  },
  {
    icon: FileText,
    title: "Resume Parsing",
    description:
      "Upload your resume once. Our AI extracts your experience, skills, and education to fill applications accurately.",
  },
];

const steps = [
  {
    step: 1,
    icon: Upload,
    title: "Upload Your Resume",
    description:
      "Import your resume and let our AI build a rich profile of your skills, experience, and preferences.",
  },
  {
    step: 2,
    icon: Sparkles,
    title: "Paste a Job URL",
    description:
      "Drop in any job posting link. Valet analyzes the requirements and pre-fills the entire application form.",
  },
  {
    step: 3,
    icon: Rocket,
    title: "Review & Apply",
    description:
      "Check the AI-filled fields, adjust anything you like, and submit with a single click. Done in minutes, not hours.",
  },
];

const testimonials = [
  {
    quote:
      "I went from spending 45 minutes per application to under 5. Landed interviews at 3 FAANG companies in my first week.",
    name: "Sarah K.",
    role: "Software Engineer",
  },
  {
    quote:
      "The Copilot mode is brilliant. I still review everything, but the AI does 90% of the grunt work. Game changer for my job search.",
    name: "Marcus T.",
    role: "Product Manager",
  },
  {
    quote:
      "Applied to 200+ roles in a month without burning out. The quality of each application stayed high because the AI matched my actual experience.",
    name: "Priya R.",
    role: "Data Scientist",
  },
];

export function LandingPage() {
  useEffect(() => {
    document.title = "WeKruit Valet - AI-Powered Job Application Automation";
  }, []);

  return (
    <div className="min-h-screen bg-[var(--wk-surface-page)]">
      <PublicHeader />

      {/* Hero */}
      <section className="relative overflow-hidden px-4 md:px-6 py-12 md:py-20 lg:py-32">
        <div className="mx-auto max-w-[var(--wk-max-width)] text-center">
          <Badge className="mb-4 md:mb-6">Now in Beta</Badge>
          <h1 className="wk-display-xl mx-auto max-w-4xl text-3xl md:text-5xl lg:text-6xl font-display font-semibold text-[var(--wk-text-primary)]">
            Stop filling out
            <br />
            job applications.
          </h1>
          <p className="wk-body-lg mx-auto mt-6 max-w-2xl text-[var(--wk-text-secondary)]">
            WeKruit Valet uses AI to fill out job applications for you. Upload
            your resume, paste a job URL, and apply in minutes instead of hours.
            You review everything before it goes out.
          </p>
          <div className="mt-8 md:mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Button asChild size="lg" variant="cta" className="w-full sm:w-auto">
              <Link to="/login">Start Applying Free</Link>
            </Button>
            <Button asChild size="lg" variant="secondary" className="w-full sm:w-auto">
              <Link to="/pricing">View Pricing</Link>
            </Button>
          </div>
          <div className="mt-6 md:mt-8 flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 text-xs sm:text-sm text-[var(--wk-text-tertiary)]">
            <span className="flex items-center gap-1.5">
              <Shield className="h-4 w-4" />
              AES-256 encrypted
            </span>
            <span>No credit card required</span>
            <span>5 free applications/month</span>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-[var(--wk-border-subtle)] px-4 md:px-6 py-12 md:py-20 lg:py-24">
        <div className="mx-auto max-w-[var(--wk-max-width)]">
          <div className="text-center">
            <p className="wk-caption text-[var(--wk-accent-amber)]">
              Features
            </p>
            <h2 className="wk-display-lg mt-3 text-[var(--wk-text-primary)]">
              Everything you need to apply faster
            </h2>
            <p className="wk-body-base mx-auto mt-4 max-w-2xl text-[var(--wk-text-secondary)]">
              From parsing your resume to filling multi-step forms across every
              major job platform, Valet handles the busywork so you can focus on
              what matters.
            </p>
          </div>

          <div className="mt-10 md:mt-16 grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((feature) => (
              <Card key={feature.title} className="border-transparent">
                <CardContent className="p-6">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[var(--wk-radius-xl)] bg-[var(--wk-surface-sunken)]">
                    <feature.icon className="h-5 w-5 text-[var(--wk-accent-amber)]" />
                  </div>
                  <h3 className="mt-4 font-display text-lg font-semibold">
                    {feature.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--wk-text-secondary)]">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How it Works */}
      <section className="border-t border-[var(--wk-border-subtle)] bg-[var(--wk-surface-raised)] px-4 md:px-6 py-12 md:py-20 lg:py-24">
        <div className="mx-auto max-w-[var(--wk-max-width)]">
          <div className="text-center">
            <p className="wk-caption text-[var(--wk-accent-amber)]">
              How It Works
            </p>
            <h2 className="wk-display-lg mt-3 text-[var(--wk-text-primary)]">
              Three steps to your next role
            </h2>
          </div>

          <div className="mt-10 md:mt-16 grid gap-8 md:gap-10 grid-cols-1 md:grid-cols-3">
            {steps.map((step) => (
              <div key={step.step} className="text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--wk-text-primary)]">
                  <step.icon className="h-6 w-6 text-[var(--wk-surface-page)]" />
                </div>
                <div className="mt-2 text-xs font-medium text-[var(--wk-text-tertiary)]">
                  Step {step.step}
                </div>
                <h3 className="mt-2 font-display text-xl font-semibold">
                  {step.title}
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-[var(--wk-text-secondary)]">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="border-t border-[var(--wk-border-subtle)] px-4 md:px-6 py-12 md:py-20 lg:py-24">
        <div className="mx-auto max-w-[var(--wk-max-width)]">
          <div className="text-center">
            <p className="wk-caption text-[var(--wk-accent-amber)]">
              Testimonials
            </p>
            <h2 className="wk-display-lg mt-3 text-[var(--wk-text-primary)]">
              Trusted by job seekers
            </h2>
          </div>

          <div className="mt-10 md:mt-16 grid gap-4 md:gap-6 grid-cols-1 md:grid-cols-3">
            {testimonials.map((testimonial) => (
              <Card key={testimonial.name}>
                <CardContent className="p-6">
                  <Quote className="h-5 w-5 text-[var(--wk-accent-amber-light)]" />
                  <p className="mt-4 text-sm leading-relaxed text-[var(--wk-text-secondary)]">
                    {testimonial.quote}
                  </p>
                  <div className="mt-6 border-t border-[var(--wk-border-subtle)] pt-4">
                    <p className="text-sm font-semibold text-[var(--wk-text-primary)]">
                      {testimonial.name}
                    </p>
                    <p className="text-xs text-[var(--wk-text-tertiary)]">
                      {testimonial.role}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-[var(--wk-border-subtle)] bg-[var(--wk-text-primary)] px-4 md:px-6 py-12 md:py-20 lg:py-24">
        <div className="mx-auto max-w-[var(--wk-content-width)] text-center">
          <h2 className="font-display text-2xl font-semibold text-[var(--wk-text-on-dark)] md:text-3xl lg:text-4xl">
            Ready to automate your job search?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base text-[var(--wk-text-on-dark-muted)]">
            Join thousands of job seekers who apply smarter, not harder. Start
            with 5 free applications every month.
          </p>
          <div className="mt-8">
            <Button
              asChild
              size="lg"
              className="bg-[var(--wk-accent-amber)] text-[var(--wk-text-primary)] hover:opacity-90"
            >
              <Link to="/login">Get Started for Free</Link>
            </Button>
          </div>
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
