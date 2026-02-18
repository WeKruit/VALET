# WeKruit Valet -- Frontend Implementation Plan

**Version:** 1.0
**Date:** 2026-02-11
**Author:** Senior Frontend Engineering
**Status:** Implementation Plan -- Ready for Engineering Review
**Depends on:** 02_user_flows_and_ux_design.md, 05_autopilot_ux_onboarding.md, 07_opensource_frontend_backend_research.md, wekruit-design-system.html

---

## Table of Contents

1. [Tech Stack Decision](#1-tech-stack-decision)
2. [WeKruit Design System to Tailwind Bridge](#2-wekruit-design-system-to-tailwind-bridge)
3. [Component Inventory](#3-component-inventory)
4. [Page and Route Structure](#4-page-and-route-structure)
5. [Screen-by-Screen Implementation Plan](#5-screen-by-screen-implementation-plan)
6. [WebSocket Integration Pattern](#6-websocket-integration-pattern)
7. [noVNC Integration](#7-novnc-integration)
8. [Testing Strategy](#8-testing-strategy)

---

## 1. Tech Stack Decision

### 1.1 Framework: Vite + React 18 (Not Next.js)

**Decision: Vite + React 18 with React Router v7.**

Rationale:

| Factor                | Vite + React 18                                                                       | Next.js 14+ (App Router)                                                             |
| --------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| **shadcn-admin base** | Built on Vite. Zero migration.                                                        | Would require rewriting to App Router conventions.                                   |
| **SSR requirement**   | None. This is an authenticated SPA dashboard. No SEO needed for the dashboard itself. | SSR adds complexity for no benefit in a dashboard app.                               |
| **WebSocket-heavy**   | Client-side WebSocket management is straightforward.                                  | Next.js App Router RSC/streaming model complicates long-lived WebSocket connections. |
| **noVNC embedding**   | Standard React component lifecycle.                                                   | RSC boundary issues with a purely client-side VNC component.                         |
| **Build speed**       | Vite HMR is ~10x faster than Next.js dev server.                                      | Slower dev server, especially with App Router.                                       |
| **Bundle size**       | Smaller. No framework overhead.                                                       | Next.js adds ~80-120KB to the bundle for routing + RSC runtime.                      |
| **Deployment**        | Static hosting (S3/CloudFront, Vercel Static, Netlify). Simple.                       | Requires a Node.js server or specialized hosting (Vercel).                           |

**Exception: Landing/marketing page** (Screen 1) may be a separate Next.js project or static site for SEO benefits. The dashboard SPA is the scope of this plan.

### 1.2 Complete Tech Stack

| Layer                     | Choice                    | Version          | License    | Justification                                                     |
| ------------------------- | ------------------------- | ---------------- | ---------- | ----------------------------------------------------------------- |
| **Build tool**            | Vite                      | 6.x              | MIT        | shadcn-admin default. Fast HMR.                                   |
| **Framework**             | React                     | 18.x             | MIT        | Industry standard. Concurrent features for real-time UI.          |
| **Language**              | TypeScript                | 5.x              | Apache-2.0 | Type safety across API contracts.                                 |
| **Routing**               | React Router              | v7               | MIT        | File-based routing optional. shadcn-admin uses it.                |
| **Styling**               | Tailwind CSS              | v4               | MIT        | Utility-first. WeKruit tokens bridge via CSS custom properties.   |
| **UI Base**               | shadcn/ui                 | Latest           | MIT        | Copy-paste component model. Full ownership. Radix primitives.     |
| **Dashboard Shell**       | shadcn-admin (fork)       | Latest           | MIT        | Sidebar, nav, auth pages, data tables, settings. 6-8 weeks saved. |
| **Charts**                | Tremor                    | Latest           | Apache-2.0 | Tailwind-native. Copy-paste model. Area, bar, donut, KPI cards.   |
| **Forms**                 | React Hook Form + Zod     | RHF 7.x, Zod 3.x | MIT        | Already in shadcn-admin. Schema-first validation.                 |
| **Dynamic Forms**         | react-jsonschema-form     | 5.x              | Apache-2.0 | JSON Schema-driven Q&A bank. Custom shadcn widgets.               |
| **Server State**          | TanStack Query            | v5               | MIT        | Cache, refetch, optimistic updates for REST API calls.            |
| **Client State**          | Zustand                   | 4.x              | MIT        | Lightweight. Perfect for WebSocket-driven real-time state.        |
| **Notifications (toast)** | Sonner                    | Latest           | MIT        | Already in shadcn/ui. Beautiful toasts out of the box.            |
| **Notifications (inbox)** | Novu @novu/react          | Latest           | MIT        | Embeddable inbox component. Multi-channel backend.                |
| **VNC Viewer**            | react-vnc                 | Latest           | MIT        | React wrapper for noVNC. CAPTCHA takeover modal.                  |
| **Payments**              | @stripe/react-stripe-js   | Latest           | MIT        | Official Stripe React bindings. PCI-compliant.                    |
| **Feature gating**        | use-stripe-subscription   | Latest           | MIT        | Subscription-aware hooks. `<Gate>` component.                     |
| **HTTP Client**           | ky (or native fetch)      | Latest           | MIT        | Tiny, typed. Works with TanStack Query.                           |
| **Date handling**         | date-fns                  | Latest           | MIT        | Tree-shakeable. No moment.js bloat.                               |
| **Animation**             | Framer Motion             | Latest           | MIT        | Layout animations, page transitions, micro-interactions.          |
| **Icons**                 | Lucide React              | Latest           | ISC        | Already in shadcn/ui. 1000+ icons.                                |
| **Testing**               | Vitest + RTL + Playwright | Latest           | MIT        | Unit + component + E2E. Vitest shares Vite config.                |
| **Storybook**             | Storybook                 | 8.x              | MIT        | Component documentation and visual testing.                       |

### 1.3 Package Manager and Monorepo

**Decision: pnpm with a simple workspace** (not a full monorepo framework like Turborepo or Nx at this stage).

```
wekruit-dashboard/
  packages/
    ui/             # Shared design system components (extracted from shadcn fork)
    web/            # Main dashboard SPA
    email/          # React Email templates (pre-rendered at build time)
```

This keeps the UI components reusable if we later build the landing page or a mobile wrapper. But for MVP, `packages/web/` is the primary workspace.

---

## 2. WeKruit Design System to Tailwind Bridge

### 2.1 Architecture

The WeKruit design system defines all tokens as CSS custom properties (`--wk-*`). The bridge strategy:

1. **CSS custom properties remain the single source of truth.** They live in a `globals.css` file and handle light/dark mode via `[data-theme="dark"]`.
2. **Tailwind extends its theme** to reference these CSS properties, creating utility classes like `bg-wk-surface-page`, `text-wk-primary`, etc.
3. **shadcn/ui CSS variables are remapped** to WeKruit tokens. shadcn uses `--background`, `--foreground`, etc. We point these at the `--wk-*` equivalents.
4. **Component variants** (Button, Card, etc.) are customized via shadcn's `cva` (class-variance-authority) definitions.

### 2.2 globals.css -- WeKruit Token Foundation

```css
/* globals.css */
@import "tailwindcss";

/* ============================================
   WEKRUIT DESIGN TOKENS
   ============================================ */

@layer base {
  :root {
    /* Core Brand Colors */
    --wk-brand-espresso: #2b180a;
    --wk-brand-espresso-90: #40291a;
    --wk-brand-espresso-80: #553a2a;
    --wk-brand-espresso-70: #6a4b3a;

    /* Surfaces */
    --wk-surface-page: #fcf6ef;
    --wk-surface-raised: #f6f0e9;
    --wk-surface-sunken: #efe7dd;
    --wk-surface-overlay: rgba(240, 231, 221, 0.32);
    --wk-surface-card: #f5efe8;
    --wk-surface-white: #ffffff;

    /* Text */
    --wk-text-primary: #2b180a;
    --wk-text-secondary: #94877c;
    --wk-text-tertiary: #b0a59b;
    --wk-text-on-dark: #faf6f2;
    --wk-text-on-dark-muted: rgba(255, 255, 255, 0.8);
    --wk-text-inverse: #ffffff;

    /* Borders */
    --wk-border-subtle: rgba(43, 24, 10, 0.08);
    --wk-border-default: rgba(43, 24, 10, 0.12);
    --wk-border-strong: rgba(43, 24, 10, 0.2);

    /* Accents */
    --wk-accent-amber: #e8923a;
    --wk-accent-amber-light: #f5c88a;
    --wk-accent-teal: #3aafb0;
    --wk-accent-coral: #e86b4a;

    /* Semantic: Status colors */
    --wk-status-success: #059669;
    --wk-status-warning: #d97706;
    --wk-status-error: #dc2626;
    --wk-status-info: #2563eb;

    /* Shadows */
    --wk-shadow-sm: 0 1px 2px rgba(43, 24, 10, 0.06);
    --wk-shadow-md: 0 4px 12px rgba(43, 24, 10, 0.08);
    --wk-shadow-lg: 0 8px 24px rgba(43, 24, 10, 0.1);
    --wk-shadow-xl: 0 16px 48px rgba(43, 24, 10, 0.12);

    /* Typography */
    --wk-font-display: "Halant", serif;
    --wk-font-body: "Geist", sans-serif;

    /* Spacing Scale (4px base grid) */
    --wk-space-1: 4px;
    --wk-space-2: 8px;
    --wk-space-3: 12px;
    --wk-space-4: 16px;
    --wk-space-5: 20px;
    --wk-space-6: 24px;
    --wk-space-8: 32px;
    --wk-space-10: 40px;
    --wk-space-12: 48px;
    --wk-space-16: 64px;
    --wk-space-20: 80px;
    --wk-space-24: 96px;
    --wk-space-32: 128px;

    /* Border Radius */
    --wk-radius-sm: 4px;
    --wk-radius-md: 8px;
    --wk-radius-lg: 12px;
    --wk-radius-xl: 16px;
    --wk-radius-2xl: 20px;
    --wk-radius-3xl: 24px;
    --wk-radius-full: 9999px;

    /* Layout */
    --wk-max-width: 1200px;
    --wk-content-width: 960px;
    --wk-narrow-width: 720px;

    /* Transitions */
    --wk-ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);
    --wk-ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
    --wk-duration-fast: 150ms;
    --wk-duration-base: 250ms;
    --wk-duration-slow: 400ms;

    /* === shadcn/ui variable bridge === */
    --background: var(--wk-surface-page);
    --foreground: var(--wk-text-primary);
    --card: var(--wk-surface-card);
    --card-foreground: var(--wk-text-primary);
    --popover: var(--wk-surface-white);
    --popover-foreground: var(--wk-text-primary);
    --primary: var(--wk-text-primary);
    --primary-foreground: var(--wk-surface-page);
    --secondary: var(--wk-surface-raised);
    --secondary-foreground: var(--wk-text-primary);
    --muted: var(--wk-surface-sunken);
    --muted-foreground: var(--wk-text-secondary);
    --accent: var(--wk-accent-amber);
    --accent-foreground: var(--wk-text-inverse);
    --destructive: var(--wk-status-error);
    --destructive-foreground: var(--wk-text-inverse);
    --border: var(--wk-border-default);
    --input: var(--wk-border-default);
    --ring: var(--wk-border-strong);
    --radius: var(--wk-radius-lg);

    /* Chart colors (Tremor) */
    --chart-1: var(--wk-accent-amber);
    --chart-2: var(--wk-accent-teal);
    --chart-3: var(--wk-accent-coral);
    --chart-4: var(--wk-brand-espresso-80);
    --chart-5: var(--wk-accent-amber-light);
  }

  [data-theme="dark"] {
    --wk-brand-espresso: #f5e6d4;
    --wk-brand-espresso-90: #e0cdb8;
    --wk-brand-espresso-80: #c4ad94;
    --wk-brand-espresso-70: #a89078;

    --wk-surface-page: #1a1210;
    --wk-surface-raised: #241c18;
    --wk-surface-sunken: #12100e;
    --wk-surface-overlay: rgba(30, 22, 18, 0.64);
    --wk-surface-card: #2a2220;
    --wk-surface-white: #302824;

    --wk-text-primary: #f5e6d4;
    --wk-text-secondary: #a89888;
    --wk-text-tertiary: #7a6e64;
    --wk-text-on-dark: #f5e6d4;
    --wk-text-on-dark-muted: rgba(245, 230, 212, 0.7);
    --wk-text-inverse: #1a1210;

    --wk-border-subtle: rgba(245, 230, 212, 0.06);
    --wk-border-default: rgba(245, 230, 212, 0.1);
    --wk-border-strong: rgba(245, 230, 212, 0.18);

    --wk-accent-amber: #f0a050;
    --wk-accent-amber-light: #d4945a;
    --wk-accent-teal: #4dc4c4;
    --wk-accent-coral: #f07858;

    --wk-shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.2);
    --wk-shadow-md: 0 4px 12px rgba(0, 0, 0, 0.25);
    --wk-shadow-lg: 0 8px 24px rgba(0, 0, 0, 0.3);
    --wk-shadow-xl: 0 16px 48px rgba(0, 0, 0, 0.35);
  }
}
```

### 2.3 tailwind.config.ts -- Theme Extension

```typescript
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./src/**/*.{ts,tsx}", "./index.html"],
  theme: {
    extend: {
      // ── Colors ──────────────────────────────────
      colors: {
        // Brand
        "wk-espresso": "var(--wk-brand-espresso)",
        "wk-espresso-90": "var(--wk-brand-espresso-90)",
        "wk-espresso-80": "var(--wk-brand-espresso-80)",
        "wk-espresso-70": "var(--wk-brand-espresso-70)",

        // Surfaces
        "wk-page": "var(--wk-surface-page)",
        "wk-raised": "var(--wk-surface-raised)",
        "wk-sunken": "var(--wk-surface-sunken)",
        "wk-overlay": "var(--wk-surface-overlay)",
        "wk-card": "var(--wk-surface-card)",
        "wk-white": "var(--wk-surface-white)",

        // Text
        "wk-primary": "var(--wk-text-primary)",
        "wk-secondary": "var(--wk-text-secondary)",
        "wk-tertiary": "var(--wk-text-tertiary)",
        "wk-on-dark": "var(--wk-text-on-dark)",
        "wk-on-dark-muted": "var(--wk-text-on-dark-muted)",
        "wk-inverse": "var(--wk-text-inverse)",

        // Borders
        "wk-border-subtle": "var(--wk-border-subtle)",
        "wk-border": "var(--wk-border-default)",
        "wk-border-strong": "var(--wk-border-strong)",

        // Accents
        "wk-amber": "var(--wk-accent-amber)",
        "wk-amber-light": "var(--wk-accent-amber-light)",
        "wk-teal": "var(--wk-accent-teal)",
        "wk-coral": "var(--wk-accent-coral)",

        // Status (semantic)
        "wk-success": "var(--wk-status-success)",
        "wk-warning": "var(--wk-status-warning)",
        "wk-error": "var(--wk-status-error)",
        "wk-info": "var(--wk-status-info)",

        // shadcn/ui bridge (these reference the same --wk-* vars via the bridge in globals.css)
        background: "var(--background)",
        foreground: "var(--foreground)",
        card: { DEFAULT: "var(--card)", foreground: "var(--card-foreground)" },
        popover: { DEFAULT: "var(--popover)", foreground: "var(--popover-foreground)" },
        primary: { DEFAULT: "var(--primary)", foreground: "var(--primary-foreground)" },
        secondary: { DEFAULT: "var(--secondary)", foreground: "var(--secondary-foreground)" },
        muted: { DEFAULT: "var(--muted)", foreground: "var(--muted-foreground)" },
        accent: { DEFAULT: "var(--accent)", foreground: "var(--accent-foreground)" },
        destructive: { DEFAULT: "var(--destructive)", foreground: "var(--destructive-foreground)" },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
      },

      // ── Typography ──────────────────────────────
      fontFamily: {
        display: ["var(--wk-font-display)"],
        body: ["var(--wk-font-body)"],
        // shadcn bridge
        sans: ["var(--wk-font-body)"],
        serif: ["var(--wk-font-display)"],
      },

      fontSize: {
        "wk-xs": ["var(--wk-text-xs)", { lineHeight: "var(--wk-leading-normal)" }],
        "wk-sm": ["var(--wk-text-sm)", { lineHeight: "var(--wk-leading-normal)" }],
        "wk-base": ["var(--wk-text-base)", { lineHeight: "var(--wk-leading-normal)" }],
        "wk-lg": ["var(--wk-text-lg)", { lineHeight: "var(--wk-leading-relaxed)" }],
        "wk-xl": ["var(--wk-text-xl)", { lineHeight: "var(--wk-leading-snug)" }],
        "wk-2xl": ["var(--wk-text-2xl)", { lineHeight: "var(--wk-leading-snug)" }],
        "wk-3xl": ["var(--wk-text-3xl)", { lineHeight: "var(--wk-leading-tight)" }],
        "wk-4xl": ["var(--wk-text-4xl)", { lineHeight: "var(--wk-leading-tight)" }],
        "wk-5xl": ["var(--wk-text-5xl)", { lineHeight: "var(--wk-leading-tight)" }],
        "wk-6xl": ["var(--wk-text-6xl)", { lineHeight: "var(--wk-leading-tight)" }],
      },

      letterSpacing: {
        "wk-tight": "var(--wk-tracking-tight)",
        "wk-normal": "var(--wk-tracking-normal)",
        "wk-wide": "var(--wk-tracking-wide)",
        "wk-wider": "var(--wk-tracking-wider)",
      },

      lineHeight: {
        "wk-tight": "var(--wk-leading-tight)",
        "wk-snug": "var(--wk-leading-snug)",
        "wk-normal": "var(--wk-leading-normal)",
        "wk-relaxed": "var(--wk-leading-relaxed)",
      },

      // ── Spacing (4px base grid) ─────────────────
      spacing: {
        "wk-1": "var(--wk-space-1)",
        "wk-2": "var(--wk-space-2)",
        "wk-3": "var(--wk-space-3)",
        "wk-4": "var(--wk-space-4)",
        "wk-5": "var(--wk-space-5)",
        "wk-6": "var(--wk-space-6)",
        "wk-8": "var(--wk-space-8)",
        "wk-10": "var(--wk-space-10)",
        "wk-12": "var(--wk-space-12)",
        "wk-16": "var(--wk-space-16)",
        "wk-20": "var(--wk-space-20)",
        "wk-24": "var(--wk-space-24)",
        "wk-32": "var(--wk-space-32)",
      },

      // ── Border Radius ───────────────────────────
      borderRadius: {
        "wk-sm": "var(--wk-radius-sm)",
        "wk-md": "var(--wk-radius-md)",
        "wk-lg": "var(--wk-radius-lg)",
        "wk-xl": "var(--wk-radius-xl)",
        "wk-2xl": "var(--wk-radius-2xl)",
        "wk-3xl": "var(--wk-radius-3xl)",
        "wk-full": "var(--wk-radius-full)",
        // shadcn bridge
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },

      // ── Shadows ─────────────────────────────────
      boxShadow: {
        "wk-sm": "var(--wk-shadow-sm)",
        "wk-md": "var(--wk-shadow-md)",
        "wk-lg": "var(--wk-shadow-lg)",
        "wk-xl": "var(--wk-shadow-xl)",
      },

      // ── Transitions ─────────────────────────────
      transitionTimingFunction: {
        "wk-default": "var(--wk-ease-default)",
        "wk-spring": "var(--wk-ease-spring)",
      },
      transitionDuration: {
        "wk-fast": "var(--wk-duration-fast)",
        "wk-base": "var(--wk-duration-base)",
        "wk-slow": "var(--wk-duration-slow)",
      },

      // ── Layout ──────────────────────────────────
      maxWidth: {
        "wk-max": "var(--wk-max-width)",
        "wk-content": "var(--wk-content-width)",
        "wk-narrow": "var(--wk-narrow-width)",
      },

      // ── Keyframes ───────────────────────────────
      keyframes: {
        "pulse-amber": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(232, 146, 58, 0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(232, 146, 58, 0)" },
        },
        "pulse-red": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(220, 38, 38, 0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(220, 38, 38, 0)" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
      },
      animation: {
        "pulse-amber": "pulse-amber 2s ease-in-out infinite",
        "pulse-red": "pulse-red 1.5s ease-in-out infinite",
        "slide-in-right": "slide-in-right 0.3s ease-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"), // Used by shadcn/ui
  ],
} satisfies Config;
```

### 2.4 Typography Utility Classes

```css
/* Additional utility classes in globals.css */
@layer utilities {
  /* Display typography (Halant serif) */
  .wk-display-xl {
    font-family: var(--wk-font-display);
    font-size: var(--wk-text-6xl);
    font-weight: var(--wk-weight-regular);
    line-height: var(--wk-leading-tight);
    letter-spacing: var(--wk-tracking-tight);
  }

  .wk-display-lg {
    font-family: var(--wk-font-display);
    font-size: var(--wk-text-4xl);
    font-weight: var(--wk-weight-regular);
    line-height: var(--wk-leading-tight);
    letter-spacing: var(--wk-tracking-tight);
  }

  .wk-display-md {
    font-family: var(--wk-font-display);
    font-size: var(--wk-text-2xl);
    font-weight: var(--wk-weight-regular);
    line-height: var(--wk-leading-snug);
  }

  .wk-display-sm {
    font-family: var(--wk-font-display);
    font-size: var(--wk-text-xl);
    font-weight: var(--wk-weight-medium);
    line-height: var(--wk-leading-snug);
  }

  /* Body typography (Geist sans-serif) */
  .wk-body-lg {
    font-family: var(--wk-font-body);
    font-size: var(--wk-text-lg);
    font-weight: var(--wk-weight-regular);
    line-height: var(--wk-leading-relaxed);
  }

  .wk-body-base {
    font-family: var(--wk-font-body);
    font-size: var(--wk-text-base);
    font-weight: var(--wk-weight-regular);
    line-height: var(--wk-leading-normal);
  }

  .wk-body-sm {
    font-family: var(--wk-font-body);
    font-size: var(--wk-text-sm);
    font-weight: var(--wk-weight-regular);
    line-height: var(--wk-leading-normal);
  }

  .wk-caption {
    font-family: var(--wk-font-body);
    font-size: var(--wk-text-xs);
    font-weight: var(--wk-weight-medium);
    line-height: var(--wk-leading-normal);
    letter-spacing: var(--wk-tracking-wider);
    text-transform: uppercase;
  }

  /* Stat number (used in stat cards) */
  .wk-stat-number {
    font-family: var(--wk-font-display);
    font-size: var(--wk-text-4xl);
    font-weight: var(--wk-weight-regular);
    line-height: var(--wk-leading-tight);
  }
}
```

### 2.5 Component Variant Mapping (shadcn Button Example)

```tsx
// src/components/ui/button.tsx
import { cva, type VariantProps } from "class-variance-authority";

const buttonVariants = cva(
  // Base styles matching wk-btn
  [
    "inline-flex items-center justify-center gap-wk-2",
    "font-body font-medium",
    "border-none cursor-pointer no-underline",
    "transition-all duration-wk-base ease-wk-default",
    "disabled:pointer-events-none disabled:opacity-50",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
  ],
  {
    variants: {
      variant: {
        // wk-btn-primary: dark bg, light text
        primary: [
          "bg-wk-primary text-wk-page",
          "rounded-wk-lg",
          "hover:opacity-[0.88] hover:-translate-y-px hover:shadow-wk-md",
        ],
        // wk-btn-secondary: white bg, dark text, border
        secondary: [
          "bg-wk-white text-wk-primary",
          "rounded-wk-lg",
          "border border-wk-border",
          "hover:bg-wk-raised hover:border-wk-border-strong",
        ],
        // wk-btn-ghost: transparent bg
        ghost: ["bg-transparent text-wk-primary", "rounded-wk-lg", "hover:bg-wk-sunken"],
        // wk-btn-cta: large primary
        cta: [
          "bg-wk-primary text-wk-page",
          "rounded-wk-lg",
          "font-semibold",
          "hover:opacity-[0.88] hover:-translate-y-0.5 hover:shadow-wk-lg",
        ],
        // Destructive action
        destructive: ["bg-wk-error text-wk-inverse", "rounded-wk-lg", "hover:opacity-90"],
        // Link style
        link: ["text-wk-primary underline-offset-4", "hover:underline"],
      },
      size: {
        sm: "px-3.5 py-1.5 text-wk-xs rounded-wk-md",
        default: "px-6 py-2.5 text-wk-sm",
        lg: "px-8 py-3.5 text-wk-base",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "default",
    },
  },
);
```

### 2.6 Theme Toggle Implementation

```tsx
// src/hooks/use-theme.ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

type Theme = "light" | "dark" | "system";

interface ThemeStore {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

export const useTheme = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: "light",
      setTheme: (theme) => {
        set({ theme });
        const root = document.documentElement;
        if (theme === "dark") {
          root.setAttribute("data-theme", "dark");
        } else if (theme === "light") {
          root.removeAttribute("data-theme");
        } else {
          // System preference
          const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          if (prefersDark) {
            root.setAttribute("data-theme", "dark");
          } else {
            root.removeAttribute("data-theme");
          }
        }
      },
    }),
    { name: "wk-theme" },
  ),
);
```

---

## 3. Component Inventory

### 3.1 Full Component List

| #   | Component              | shadcn/ui Base                | WeKruit Customization                                                                                            | Screen(s) Used                                                            |
| --- | ---------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1   | **Button**             | Button                        | `wk-btn-primary/secondary/ghost/cta` variants, warm hover shadows, `-translate-y` lift                           | All screens                                                               |
| 2   | **Card**               | Card                          | `bg-wk-card`, `rounded-wk-2xl`, `border-wk-border-subtle`, warm shadow on hover                                  | Dashboard, Application Complete, Settings                                 |
| 3   | **StatCard**           | Card (custom)                 | `bg-wk-sunken`, `rounded-wk-xl`, Halant `wk-stat-number` for big numbers                                         | Dashboard stats bar                                                       |
| 4   | **ImageCard**          | Card (custom)                 | `rounded-wk-2xl`, 4:3 aspect ratio, gradient overlay, Halant title                                               | Landing page, partner features                                            |
| 5   | **PartnerCard**        | Card (custom)                 | `bg-wk-sunken`, logo placeholder, name + description layout                                                      | Landing page                                                              |
| 6   | **ApplicationCard**    | Card (custom)                 | Progress bar, status badge, action buttons, pulse animations for review/CAPTCHA states                           | Dashboard active applications                                             |
| 7   | **Input**              | Input                         | `bg-wk-white`, `border-wk-border`, `rounded-wk-md`, espresso focus ring                                          | Onboarding, Settings, New Application                                     |
| 8   | **Label**              | Label                         | `text-wk-sm`, `font-medium`, `text-wk-primary`                                                                   | All forms                                                                 |
| 9   | **Textarea**           | Textarea                      | Same styling as Input, auto-resize                                                                               | Q&A Bank, Override fields                                                 |
| 10  | **Select**             | Select                        | Radix-based, warm surface dropdown, `rounded-wk-md`                                                              | Q&A Bank, Settings                                                        |
| 11  | **Checkbox**           | Checkbox                      | Espresso check color, `rounded-wk-sm`                                                                            | Settings, Legal consent                                                   |
| 12  | **RadioGroup**         | RadioGroup                    | Espresso dot color                                                                                               | Settings (automation preferences)                                         |
| 13  | **Switch**             | Switch                        | Amber accent when active, `rounded-wk-full`                                                                      | Settings toggles                                                          |
| 14  | **Slider**             | Slider                        | Amber accent track, espresso thumb                                                                               | Confidence threshold                                                      |
| 15  | **Badge / Chip**       | Badge                         | `wk-chip` (rounded-full, `bg-wk-raised`), `wk-chip-section` (sunken), `wk-chip-tag` (on-dark with backdrop-blur) | Dashboard, Job Preview, Skills                                            |
| 16  | **Dialog / Modal**     | Dialog                        | `bg-wk-white`, `rounded-wk-2xl`, warm overlay, Halant title                                                      | CAPTCHA takeover, Confirmations, Overrides                                |
| 17  | **Sheet**              | Sheet                         | Side panel for mobile nav, notification drawer                                                                   | Mobile nav, Notification detail                                           |
| 18  | **DropdownMenu**       | DropdownMenu                  | `bg-wk-white`, `rounded-wk-lg`, warm shadow, espresso text                                                       | Avatar menu, Action menus                                                 |
| 19  | **NavigationMenu**     | Custom (shadcn-admin sidebar) | `bg-wk-page`, espresso brand text, Halant logo, `rounded-wk-xl` pill nav                                         | All dashboard screens                                                     |
| 20  | **Breadcrumb**         | Breadcrumb                    | `text-wk-secondary`, slash separator                                                                             | Settings sub-pages                                                        |
| 21  | **Tabs**               | Tabs                          | Espresso active tab underline, `text-wk-secondary` inactive                                                      | Settings, Application detail                                              |
| 22  | **DataTable**          | Table + TanStack Table        | `bg-wk-white`, `rounded-wk-2xl`, warm header row, amber/green/red status dots                                    | Recent Applications, Application History                                  |
| 23  | **Progress**           | Progress                      | Amber fill on `bg-wk-sunken` track, `rounded-wk-full`                                                            | Application progress, batch progress                                      |
| 24  | **Stepper**            | Custom                        | 8-step horizontal stepper, espresso completed circles, blue active, gray pending                                 | Application Progress view                                                 |
| 25  | **ConfidenceScore**    | Custom                        | Green (90-100%), Amber (70-89%), Red (<70%) color coding, inline percentage with dot indicator                   | Pre-fill preview, Review, Summary                                         |
| 26  | **Toast**              | Sonner                        | Warm surface background, espresso text, amber accent on actions                                                  | All screens (feedback)                                                    |
| 27  | **NotificationInbox**  | Novu `<Inbox>`                | Themed with WeKruit colors, espresso bell icon, amber unread count badge                                         | Top nav bar                                                               |
| 28  | **Skeleton**           | Skeleton                      | `bg-wk-sunken` shimmer on `bg-wk-raised`                                                                         | All loading states                                                        |
| 29  | **Avatar**             | Avatar                        | `rounded-wk-full`, Google profile image fallback to initials                                                     | Top nav, profile                                                          |
| 30  | **Tooltip**            | Tooltip                       | `bg-wk-primary`, `text-wk-page` (inverted), `rounded-wk-md`                                                      | Confidence explanations, mode info                                        |
| 31  | **ScrollArea**         | ScrollArea                    | Custom scrollbar matching warm palette                                                                           | Field log, Live feed                                                      |
| 32  | **Separator**          | Separator                     | `bg-wk-border-subtle`                                                                                            | Settings sections, card dividers                                          |
| 33  | **Alert**              | Alert                         | Amber background for warnings, red for errors, teal for info, green for success                                  | Error states, Trust nudges, Mode change confirmations                     |
| 34  | **AlertDialog**        | AlertDialog                   | `bg-wk-white`, `rounded-wk-2xl`, espresso title, destructive red button for dangerous actions                    | Cancel application, Disconnect LinkedIn, Pause All                        |
| 35  | **Accordion**          | Accordion                     | Chevron toggle, espresso text, sunken expanded content                                                           | Work Experience (onboarding review), Field details (Application Complete) |
| 36  | **FileUpload**         | Custom (Dropzone)             | Dashed border (`border-wk-border`), cloud icon, blue dashed on drag-over, green check on success                 | Resume upload                                                             |
| 37  | **VncViewer**          | react-vnc `<VncScreen>`       | Embedded in Dialog, connection status bar, countdown timer, Resume/Cancel buttons                                | CAPTCHA takeover modal                                                    |
| 38  | **MatchScoreBar**      | Custom                        | 4 sub-score bars (Skills, Experience, Location, Education), color-coded, percentage labels                       | Job Preview (New Application)                                             |
| 39  | **FieldLog**           | Custom                        | Real-time scrolling list of field entries with status icons, values, confidence percentages                      | Application Progress view                                                 |
| 40  | **BrowserPreview**     | Custom                        | Screenshot image with timestamp overlay, refresh button, click-to-enlarge                                        | Application Progress view                                                 |
| 41  | **LiveFeed**           | Custom                        | Chronological list of application status rows, green/blue/gray color coding, compact/expanded toggle             | Autopilot Dashboard                                                       |
| 42  | **BatchProgress**      | Custom                        | Single progress bar with submitted/in-progress/queued counts, estimated completion time                          | Autopilot Dashboard                                                       |
| 43  | **ModeToggle**         | Custom                        | Steering wheel (Copilot) / Gauge (Autopilot) icons, blue/purple accent colors, toggle switch between modes       | Settings, New Application, Dashboard header                               |
| 44  | **TrustNudge**         | Alert (custom)                | Lightbulb/rocket icons, amber background, action + dismiss buttons, contextual copy                              | Dashboard (progressive disclosure)                                        |
| 45  | **PricingCard**        | Card (custom)                 | Tier name, price, feature list, CTA button, "Popular" badge variant                                              | Subscription/Pricing page                                                 |
| 46  | **EmptyState**         | Custom                        | Illustration/icon, headline, description, CTA button                                                             | Dashboard (no apps), Q&A Bank (empty)                                     |
| 47  | **ScreenshotLightbox** | Dialog                        | Full-size screenshot with download button, navigation arrows for multiple screenshots                            | Application Complete, Autopilot Summary                                   |
| 48  | **ConnectionStatus**   | Custom                        | Green/yellow/red dot, label text, reconnecting spinner                                                           | VNC viewer, WebSocket status                                              |
| 49  | **CountdownTimer**     | Custom                        | MM:SS format, amber at 5min, red at 2min, pulsing animation                                                      | CAPTCHA timeout                                                           |
| 50  | **CommandMenu**        | Command                       | `bg-wk-white`, `rounded-wk-2xl`, search across applications/settings/actions                                     | Cmd+K global search                                                       |

### 3.2 Component Architecture

```
src/
  components/
    ui/                     # shadcn/ui base (auto-generated, WeKruit-themed)
      button.tsx
      card.tsx
      dialog.tsx
      input.tsx
      ... (all shadcn primitives)

    wk/                     # WeKruit-specific composed components
      stat-card.tsx
      application-card.tsx
      confidence-score.tsx
      field-log.tsx
      browser-preview.tsx
      vnc-viewer.tsx
      match-score-bar.tsx
      live-feed.tsx
      batch-progress.tsx
      mode-toggle.tsx
      trust-nudge.tsx
      file-upload.tsx
      empty-state.tsx
      stepper.tsx
      countdown-timer.tsx
      connection-status.tsx

    layout/                 # Layout components (from shadcn-admin fork)
      sidebar.tsx
      top-nav.tsx
      main-layout.tsx
      auth-layout.tsx
```

---

## 4. Page and Route Structure

### 4.1 Route Map

```
src/
  routes/
    __root.tsx                          # Root layout (theme provider, query client, toaster)

    _auth/                              # Auth layout (centered card, no sidebar)
      login.tsx                         # Google OAuth sign-in

    _onboarding/                        # Onboarding layout (progress bar, no sidebar)
      layout.tsx                        # 3-step progress indicator
      resume-upload.tsx                 # Step 2: Resume upload + parse
      review.tsx                        # Step 3: Quick review

    _dashboard/                         # Dashboard layout (sidebar + top nav)
      layout.tsx                        # Sidebar nav, top bar, notification bell
      index.tsx                         # Dashboard home (stats + active apps + recent)

      applications/
        index.tsx                       # Full application history (data table)
        new.tsx                         # New application flow (URL input -> preview -> start)
        $applicationId/
          index.tsx                     # Application progress view (real-time)
          review.tsx                    # Review screen (Copilot pre-submit)
          complete.tsx                  # Application complete / failed
          summary.tsx                   # Autopilot post-submission summary

      settings/
        index.tsx                       # Settings overview
        profile.tsx                     # Profile & Resume
        qa-bank.tsx                     # Q&A Bank management
        notifications.tsx               # Notification preferences
        automation.tsx                  # Automation Preferences (mode selection, confidence threshold)
        connections.tsx                 # Connected Accounts (LinkedIn, Google)
        billing.tsx                     # Subscription & Billing (Stripe)
        privacy.tsx                     # Data & Privacy
```

### 4.2 Route Guards and Middleware

```tsx
// src/lib/auth.ts
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

  if (isLoading) return <FullPageSpinner />;
  if (!user) {
    navigate("/login");
    return null;
  }
  return <>{children}</>;
}

export function OnboardingGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();

  // If user has completed onboarding, redirect to dashboard
  if (user?.onboardingComplete) {
    navigate("/");
    return null;
  }
  return <>{children}</>;
}

export function AutopilotGate({ children }: { children: React.ReactNode }) {
  const { completedCopilotApps } = useUserStats();

  if (completedCopilotApps < 3) {
    return <AutopilotLockedUI completedApps={completedCopilotApps} />;
  }
  return <>{children}</>;
}
```

---

## 5. Screen-by-Screen Implementation Plan

### Screen 1: Landing / Marketing Page

**Scope:** Separate project (not part of the dashboard SPA). Likely a static site or Next.js for SEO. Out of scope for this implementation plan, but the WeKruit design system tokens and components can be shared.

**Effort: N/A** (separate project)

---

### Screen 2: Onboarding Flow

**Components used:**

- `AuthLayout` (centered card layout, no sidebar)
- `Stepper` (3-step progress: Sign Up, Resume, Quick Review)
- `FileUpload` (resume drag-and-drop)
- `Button` (primary CTA)
- `Input`, `Label` (Quick Review fields)
- `Accordion` (Work Experience, Education)
- `Badge` (Skills tags)
- `Skeleton` (resume parsing loading state)
- `ConfidenceScore` (field extraction confidence indicators)

**Data requirements:**

- `POST /api/auth/google` -- Google OAuth callback
- `POST /api/resume/upload` -- Upload resume file
- `GET /api/resume/parsed` -- Get parsed resume data
- `PATCH /api/profile` -- Update profile fields
- `POST /api/onboarding/complete` -- Mark onboarding as done

**Real-time requirements:** None. Resume parsing uses a loading state with polling or SSE for parse completion.

**State management:**

- TanStack Query for API calls (upload, parse, save profile)
- Local React state for form fields (React Hook Form)
- Zustand for onboarding step tracking

**Effort: M** (1-2 weeks)

**Key implementation notes:**

- Revised onboarding per doc 05: only 3 steps (Sign Up, Resume, Quick Review). Q&A Bank and LinkedIn are deferred to post-first-app.
- "Looks Good -- Let's Go" CTA immediately navigates to Dashboard first-time state.
- Resume parsing shows a Skeleton + "AI is reading your resume..." animation (3-5 seconds target).
- Quick Review shows collapsed experience/education sections. Inline editing is optional; "Edit details" defers to Settings.

---

### Screen 3: Dashboard (Main Screen)

**Components used:**

- `DashboardLayout` (sidebar + top nav)
- `StatCard` x4 (Total Applied, Success Rate, Avg Time, This Week)
- `ApplicationCard` (active application cards with progress bars)
- `DataTable` (Recent Applications table)
- `Button` (+ New Application CTA)
- `Badge` (status badges)
- `EmptyState` (first-time or no active apps)
- `NotificationInbox` (Novu bell icon)
- `Avatar` (user menu)
- `BatchProgress` (Autopilot batch progress bar, when applicable)
- `LiveFeed` (Autopilot live feed, when applicable)
- `ModeToggle` (Copilot/Autopilot indicator in header when Autopilot is running)
- `TrustNudge` (contextual nudges: Autopilot unlock, Q&A bank prompt, etc.)

**Data requirements:**

- `GET /api/dashboard/stats` -- Aggregate stats
- `GET /api/applications?status=active` -- Active applications (polling or WebSocket)
- `GET /api/applications?status=completed&limit=10` -- Recent applications
- `GET /api/applications/batch?batchId=...` -- Autopilot batch status
- WebSocket: `ws://api/ws/applications` -- Real-time status updates

**Real-time requirements:**

- WebSocket subscription for active application status updates (QUEUED -> FILLING -> REVIEWING -> SUBMITTED, etc.)
- WebSocket subscription for batch progress updates
- Push notification handling for CAPTCHA alerts
- Connection status indicator (reconnecting banner)

**State management:**

- TanStack Query for initial data fetch and cache
- Zustand `useApplicationStore` for WebSocket-driven real-time state
- Zustand `useDashboardStore` for UI state (active tab, filter, view mode)

**Effort: L** (2-3 weeks)

**Key implementation notes:**

- Dashboard has two modes: Copilot view (individual cards) and Autopilot view (batch progress + live feed). Switch based on whether any Autopilot applications are running.
- "Pause All" button in header when Autopilot batch is running.
- First-time state shows "Paste a job URL to try your first application" CTA with sample job links.
- Stats bar uses Tremor KPI cards or custom `StatCard` with Halant display numbers.
- Application cards pulse with amber animation when status is REVIEWING, red when CAPTCHA.
- Mobile: cards stack vertically, FAB for "+ New Application" in bottom-right.

---

### Screen 4: New Application Flow

**Components used:**

- `Input` (URL input, auto-focus)
- `Badge` (platform detection: "LinkedIn Easy Apply detected")
- `MatchScoreBar` (4 sub-scores: Skills, Experience, Location, Education)
- `DataTable` or custom list (Pre-fill Preview: field, value, confidence)
- `ConfidenceScore` (per-field indicators)
- `ModeToggle` (per-application mode override)
- `Select` (resume picker, if multiple resumes)
- `Switch` (screenshot toggle, review-before-submit toggle)
- `Button` (Cancel, Start Application)
- `Tooltip` (confidence score explanations)

**Data requirements:**

- `POST /api/applications/preview` -- Submit URL, get job preview + match score + pre-fill data
- `POST /api/applications/start` -- Queue the application
- `GET /api/profile/resumes` -- List of uploaded resumes

**Real-time requirements:** None during flow. Real-time begins after "Start Application" navigates to Progress view.

**State management:**

- TanStack Query for preview data
- React Hook Form for per-application settings overrides
- Local state for URL input + validation

**Effort: M** (1-2 weeks)

**Key implementation notes:**

- URL auto-detection: regex matching against known platform URL patterns (linkedin.com/jobs, boards.greenhouse.io, jobs.lever.co, etc.). Show platform badge after 1-second debounce.
- Pre-fill Preview table: each row shows field name, value, source (Resume/Q&A Bank/AI), and confidence dot. Clicking confidence shows tooltip with AI reasoning.
- "Edit pre-fill values" expands inline editing. Overrides saved for this application only.
- Match Score uses color gradient: green >80%, amber 60-80%, red <60%.

---

### Screen 5: Application Progress View

**Components used:**

- `Stepper` (8-step: Queue, Start, Nav, Analyze, Fill, Review, Submit, Done)
- `Progress` (percentage bar)
- `FieldLog` (real-time scrolling field list with status icons)
- `BrowserPreview` (live screenshot panel)
- `ConfidenceScore` (per-field in field log)
- `ScrollArea` (field log scrolling)
- `Button` (Pause, Cancel, Resume)
- `ConnectionStatus` (WebSocket status indicator)

**Data requirements:**

- WebSocket: `ws://api/ws/applications/{id}` -- Real-time field-by-field updates
- `GET /api/applications/{id}` -- Initial state on page load
- `GET /api/applications/{id}/screenshot` -- Latest screenshot (or delivered via WebSocket)
- `POST /api/applications/{id}/pause` -- Pause automation
- `POST /api/applications/{id}/cancel` -- Cancel automation
- `POST /api/applications/{id}/resume` -- Resume after pause

**Real-time requirements:**

- WebSocket for every field fill event (field name, value, confidence, status)
- WebSocket for screenshot updates (base64 or pre-signed URL every 3-5 seconds)
- WebSocket for status transitions (QUEUED -> INITIALIZING -> ... -> DONE)
- Reconnection handling with exponential backoff

**State management:**

- Zustand `useApplicationProgressStore` for real-time WebSocket state
- Fields array, current step, overall progress, screenshots stored in Zustand
- TanStack Query for initial load; WebSocket for ongoing updates

**Effort: L** (2-3 weeks)

**Key implementation notes:**

- Two-panel layout: Field Log (left, ~40% width) + Browser Preview (right, ~60% width). On mobile, stack vertically with preview collapsed by default.
- Field entries appear in real-time with slide-in animation as the AI fills each field.
- Screenshot updates every 3-5 seconds. Show "Last updated: Ns ago" with a refresh button.
- When status reaches REVIEWING, the view transforms to the Review Screen (inline or navigate).
- When CAPTCHA detected, Browser Preview is replaced by VNC viewer modal (Screen 6).

---

### Screen 5b: Review Screen (Copilot Pre-Submit)

**Components used:**

- All `FieldLog` entries in editable mode
- `ConfidenceScore` per field
- `Button` (Override per field, Approve and Submit, Go Back and Edit)
- `BrowserPreview` (completed form screenshot)
- `Dialog` (inline override editing)
- `Alert` (warning for medium-confidence fields)
- `Checkbox` ("Save to Q&A Bank")

**Data requirements:**

- `GET /api/applications/{id}/review` -- All filled fields with values, sources, confidence
- `PATCH /api/applications/{id}/fields/{fieldId}` -- Override a field value
- `POST /api/applications/{id}/submit` -- Approve and submit
- `POST /api/qa-bank` -- Save answer to Q&A bank

**Real-time requirements:** None (application is paused, waiting for user).

**State management:**

- React Hook Form for override values
- TanStack Query mutation for submit and override API calls

**Effort: M** (1 week, part of Screen 5)

---

### Screen 6: CAPTCHA / Human Takeover

**Components used:**

- `Dialog` (full-screen modal overlay)
- `VncViewer` (react-vnc `<VncScreen>`)
- `ConnectionStatus` (green/yellow/red dot)
- `CountdownTimer` (30-minute countdown)
- `Button` ("Resume Automation", "Skip/Cancel")
- `Alert` (connection lost / tips)

**Data requirements:**

- `GET /api/applications/{id}/vnc-session` -- Get VNC WebSocket URL + auth token
- `POST /api/applications/{id}/resume` -- Resume automation after CAPTCHA solved
- `POST /api/applications/{id}/cancel` -- Cancel application

**Real-time requirements:**

- VNC WebSocket connection (separate from application WebSocket)
- Application status WebSocket to detect auto-resolution of CAPTCHA

**State management:**

- Local component state for VNC connection status, timer, viewer dimensions
- Zustand for application status (detect if CAPTCHA auto-resolved)

**Effort: M** (1-2 weeks, including VNC setup)

---

### Screen 7: Application Complete

**Components used:**

- `Card` (success/failure header with icon animation)
- Summary key-value layout (custom)
- `ScreenshotLightbox` (confirmation screenshot, expandable)
- `DataTable` or list (field details: field, value, source, confidence)
- `Accordion` (expandable field details)
- `Button` ("View on LinkedIn", "Apply to Similar Jobs", "+ New Application", "Retry")
- `Badge` (source badges: Resume, Q&A Bank, AI, User Override)
- `Alert` (failure reason, amber for unverified submission)

**Data requirements:**

- `GET /api/applications/{id}` -- Full application data including all fields, values, sources, confidence
- `GET /api/applications/{id}/screenshots` -- Before and after screenshots

**Real-time requirements:** None (application is complete).

**State management:**

- TanStack Query for application data fetch

**Effort: S** (3-5 days)

---

### Screen 8: Settings

#### 8a. Profile & Resume

**Components used:**

- `Input`, `Label` (personal info fields)
- `FileUpload` (resume upload)
- `Card` (resume list items with download/delete/set default)
- `Accordion` (work experience, education)
- `Badge` (skills tags with remove)
- `Select` (work authorization, visa, relocation dropdowns)
- `Button` ("Save Changes", "Upload New Resume")

**Data requirements:**

- `GET /api/profile` -- Full profile data
- `PATCH /api/profile` -- Update profile
- `POST /api/resume/upload` -- Upload new resume
- `DELETE /api/resume/{id}` -- Delete resume
- `PATCH /api/resume/{id}/default` -- Set default resume

**Effort: M** (1 week)

#### 8b. Q&A Bank

**Components used:**

- Grouped question sections (Accordion or Tabs)
- `Select`, `Input`, `Textarea` (answer inputs)
- `Select` ("Always use" / "Ask each time" / "Let AI decide" per question)
- `Button` ("+ Add custom question", "Import from applications")
- `Badge` ("Last used", "Times used" metadata)
- `Input` (search/filter bar)
- react-jsonschema-form (for custom question schemas from backend)

**Data requirements:**

- `GET /api/qa-bank` -- All Q&A entries
- `POST /api/qa-bank` -- Add entry
- `PATCH /api/qa-bank/{id}` -- Update entry
- `DELETE /api/qa-bank/{id}` -- Delete entry
- `GET /api/qa-bank/suggestions` -- AI-suggested questions based on application history

**Effort: M** (1-2 weeks, including RJSF integration)

#### 8c. Notifications

**Components used:**

- `Checkbox`, `RadioGroup`, `Switch` (notification preferences)
- `Input` (quiet hours time inputs)
- `Button` ("Save Changes")

**Data requirements:**

- `GET /api/settings/notifications` -- Current preferences
- `PATCH /api/settings/notifications` -- Update preferences

**Effort: S** (2-3 days)

#### 8d. Automation Preferences

**Components used:**

- `RadioGroup` (Review mode: Copilot/Auto-submit/Always auto-submit)
- `Slider` (Confidence threshold: 70-100%)
- `Input` (rate limiting: max applications/day, min time between apps)
- `Switch` (screenshot toggles)
- `ModeToggle` (Copilot/Autopilot global default)
- `Alert` (risk warning for "Always auto-submit")
- Custom personalized threshold recommendation (based on last 20 apps)

**Data requirements:**

- `GET /api/settings/automation` -- Current automation preferences
- `PATCH /api/settings/automation` -- Update preferences
- `GET /api/applications/threshold-analysis` -- Historical analysis for threshold recommendation

**Effort: M** (1 week)

#### 8e. Connected Accounts

**Components used:**

- `Card` (per-account: Google, LinkedIn)
- `Badge` (connection status: Connected, Expired, Disconnected)
- `Button` ("Refresh Session", "Disconnect", "Connect")
- `Dialog` (secure browser login flow)
- `Input` (manual cookie paste)
- `Checkbox` (legal consent)
- `Alert` (session expiration warning)

**Data requirements:**

- `GET /api/connections` -- List connected accounts with status
- `POST /api/connections/linkedin/browser-login` -- Initiate secure browser login
- `POST /api/connections/linkedin/cookie` -- Submit manual cookie
- `DELETE /api/connections/{provider}` -- Disconnect account
- `POST /api/connections/linkedin/refresh` -- Refresh session

**Effort: M** (1 week)

#### 8f. Subscription & Billing

**Components used:**

- Stripe `<PricingTable>` embed or custom `PricingCard` components
- Stripe `<Elements>` + `<CardElement>` for payment method
- `DataTable` (invoice history)
- `Card` (current plan details, usage meter)
- `Progress` (usage bar: N of M applications used this month)
- `Button` ("Upgrade", "Downgrade", "Cancel Subscription")
- `AlertDialog` (cancel confirmation)

**Data requirements:**

- `GET /api/billing/subscription` -- Current subscription details
- `GET /api/billing/usage` -- Current period usage
- `GET /api/billing/invoices` -- Invoice history
- `POST /api/billing/checkout` -- Create Stripe checkout session
- `POST /api/billing/portal` -- Create Stripe customer portal session

**Effort: M** (1-2 weeks)

#### 8g. Data & Privacy

**Components used:**

- `Button` ("Export My Data", "Delete My Account")
- `AlertDialog` (delete account confirmation with type-to-confirm)
- `Card` (data retention info, encryption info)

**Data requirements:**

- `POST /api/data/export` -- Initiate data export (async, notification when ready)
- `DELETE /api/account` -- Delete account

**Effort: S** (2-3 days)

---

### Screen 9: Subscription / Pricing

**Components used:** (Covered in Settings 8f above. May also have a standalone page for unauthenticated users, which is part of the landing page project.)

---

### Screen 10: Browser Extension UI (v1.1)

**Scope:** Not in MVP dashboard SPA. This is a Chrome extension with its own build pipeline (likely also Vite + React + Tailwind, using the same WeKruit design tokens). The extension communicates with the dashboard backend via REST API.

**Effort: N/A** (v1.1, separate project)

---

### Screens from Autopilot UX Spec (doc 05)

#### Autopilot Dashboard View

**Components used:**

- `BatchProgress` (batch progress bar with counts)
- `LiveFeed` (chronological application status rows)
- `StatCard` (batch stats: avg confidence, avg time, errors, Q&A hit rate)
- `Button` ("Pause All" in header, "Resume All" when paused)
- `ModeToggle` (Autopilot indicator)
- `Badge` (application status in feed rows)
- `Tooltip` (confidence per-app)

**Data requirements:** Same as Dashboard plus batch-specific endpoints:

- `GET /api/applications/batch/{batchId}` -- Batch summary
- WebSocket: batch progress updates

**Real-time requirements:** Full WebSocket subscription for batch status.

**Effort:** Included in Dashboard (Screen 3) effort.

#### Autopilot Unlock Modal

**Components used:**

- `Dialog` (celebration modal)
- `ModeToggle` (side-by-side Copilot vs Autopilot cards)
- `StatCard` (user stats: "96% avg confidence, 0 errors")
- `Button` ("Keep Using Copilot", "Try Autopilot")

**Data requirements:**

- `GET /api/user/trust-level` -- Current trust level (apps completed, avg confidence, errors)
- `POST /api/settings/automation/mode` -- Set global mode

**Effort: S** (2-3 days, part of Dashboard)

#### Autopilot Post-Submission Summary

**Components used:**

- `Dialog` or dedicated page (inline from LiveFeed "View Summary" click)
- Field-by-field breakdown (same as Review Screen but read-only)
- `Badge` (source tags: Resume, Q&A Bank, AI)
- `ScreenshotLightbox` (confirmation screenshots)
- `Button` ("View on LinkedIn", "Report Issue", "Add to Q&A Bank")

**Data requirements:** Same as Application Complete (Screen 7).

**Effort: S** (3-5 days, reuses Application Complete components)

---

### 5.1 Effort Summary

| Screen                                   | Estimated Effort | Calendar Weeks  |
| ---------------------------------------- | ---------------- | --------------- |
| Onboarding (Screens 2)                   | M                | 1-2             |
| Dashboard + Autopilot View (Screen 3)    | L                | 2-3             |
| New Application Flow (Screen 4)          | M                | 1-2             |
| Application Progress + Review (Screen 5) | L                | 2-3             |
| CAPTCHA Takeover (Screen 6)              | M                | 1-2             |
| Application Complete (Screen 7)          | S                | 0.5-1           |
| Settings (Screen 8, all sub-pages)       | L                | 3-4             |
| Autopilot-specific UI (from doc 05)      | M                | 1-2             |
| **Design system setup + shadcn fork**    | M                | 1-2             |
| **WebSocket infrastructure**             | M                | 1-2             |
| **Total**                                |                  | **14-23 weeks** |

With a single senior frontend engineer, this is roughly **4-6 months**. With a two-person frontend team, **2.5-3.5 months**.

---

## 6. WebSocket Integration Pattern

### 6.1 Connection Management

```tsx
// src/lib/websocket.ts
import { useEffect, useRef } from "react";
import { create } from "zustand";

// ── Connection States ──────────────────────────
type WsStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

interface WebSocketStore {
  status: WsStatus;
  setStatus: (status: WsStatus) => void;
  reconnectAttempts: number;
  incrementReconnect: () => void;
  resetReconnect: () => void;
}

export const useWebSocketStatus = create<WebSocketStore>((set) => ({
  status: "disconnected",
  setStatus: (status) => set({ status }),
  reconnectAttempts: 0,
  incrementReconnect: () => set((s) => ({ reconnectAttempts: s.reconnectAttempts + 1 })),
  resetReconnect: () => set({ reconnectAttempts: 0 }),
}));

// ── WebSocket Manager ──────────────────────────
class WebSocketManager {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string;
  private handlers: Map<string, Set<(data: any) => void>> = new Map();
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000; // Start at 1s, exponential backoff

  constructor(url: string, token: string) {
    this.url = url;
    this.token = token;
  }

  connect() {
    const { setStatus, resetReconnect } = useWebSocketStatus.getState();
    setStatus("connecting");

    this.ws = new WebSocket(`${this.url}?token=${this.token}`);

    this.ws.onopen = () => {
      setStatus("connected");
      resetReconnect();
      this.reconnectDelay = 1000; // Reset backoff on successful connection
    };

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data) as WsMessage;
      const handlers = this.handlers.get(message.type);
      if (handlers) {
        handlers.forEach((handler) => handler(message.payload));
      }
    };

    this.ws.onclose = (event) => {
      if (!event.wasClean) {
        this.reconnect();
      } else {
        setStatus("disconnected");
      }
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private reconnect() {
    const { reconnectAttempts, incrementReconnect, setStatus } = useWebSocketStatus.getState();

    if (reconnectAttempts >= this.maxReconnectAttempts) {
      setStatus("disconnected");
      return;
    }

    setStatus("reconnecting");
    incrementReconnect();

    setTimeout(() => {
      this.connect();
    }, this.reconnectDelay);

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s... max 30s
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
  }

  on(type: string, handler: (data: any) => void) {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  send(type: string, payload: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type, payload }));
    }
  }

  disconnect() {
    this.ws?.close(1000, "Client closing");
  }
}
```

### 6.2 Message Types

```typescript
// src/types/websocket.ts

// ── Inbound (Server -> Client) ─────────────────
type WsMessage =
  | { type: "application.status_changed"; payload: ApplicationStatusPayload }
  | { type: "application.field_filled"; payload: FieldFilledPayload }
  | { type: "application.screenshot_updated"; payload: ScreenshotPayload }
  | { type: "application.captcha_detected"; payload: CaptchaPayload }
  | { type: "application.captcha_resolved"; payload: { applicationId: string } }
  | { type: "application.submitted"; payload: ApplicationSubmittedPayload }
  | { type: "application.failed"; payload: ApplicationFailedPayload }
  | { type: "batch.progress_updated"; payload: BatchProgressPayload }
  | { type: "batch.completed"; payload: BatchCompletedPayload }
  | { type: "notification.new"; payload: NotificationPayload }
  | { type: "connection.session_expired"; payload: SessionExpiredPayload }
  | { type: "trust.nudge"; payload: TrustNudgePayload };

interface ApplicationStatusPayload {
  applicationId: string;
  status: ApplicationStatus;
  step: number;
  totalSteps: number;
  progress: number; // 0-100
  message: string;
  timestamp: string;
}

interface FieldFilledPayload {
  applicationId: string;
  fieldId: string;
  fieldName: string;
  value: string;
  source: "resume" | "qa_bank" | "ai_generated" | "google" | "user_override";
  confidence: number; // 0-100
  status: "pending" | "filling" | "filled" | "failed";
  timestamp: string;
}

interface ScreenshotPayload {
  applicationId: string;
  imageUrl: string; // Pre-signed S3 URL
  timestamp: string;
}

interface CaptchaPayload {
  applicationId: string;
  vncUrl: string; // WebSocket URL for VNC connection
  vncToken: string;
  expiresAt: string; // ISO timestamp (30 min from now)
}

// ── Outbound (Client -> Server) ────────────────
type WsOutboundMessage =
  | { type: "application.pause"; payload: { applicationId: string } }
  | { type: "application.resume"; payload: { applicationId: string } }
  | { type: "application.cancel"; payload: { applicationId: string } }
  | { type: "ping"; payload: {} };
```

### 6.3 Zustand Store Integration

```typescript
// src/stores/application-store.ts
import { create } from "zustand";
import { immer } from "zustand/middleware/immer";

interface ApplicationField {
  id: string;
  name: string;
  value: string;
  source: string;
  confidence: number;
  status: "pending" | "filling" | "filled" | "failed";
}

interface ActiveApplication {
  id: string;
  jobTitle: string;
  company: string;
  platform: string;
  status: ApplicationStatus;
  step: number;
  totalSteps: number;
  progress: number;
  mode: "copilot" | "autopilot";
  fields: ApplicationField[];
  screenshotUrl: string | null;
  screenshotTimestamp: string | null;
  captcha: CaptchaPayload | null;
  startedAt: string;
  message: string;
}

interface ApplicationStore {
  activeApplications: Map<string, ActiveApplication>;

  // Actions
  updateStatus: (payload: ApplicationStatusPayload) => void;
  addField: (payload: FieldFilledPayload) => void;
  updateScreenshot: (payload: ScreenshotPayload) => void;
  setCaptcha: (payload: CaptchaPayload) => void;
  clearCaptcha: (applicationId: string) => void;
  removeApplication: (applicationId: string) => void;
}

export const useApplicationStore = create<ApplicationStore>()(
  immer((set) => ({
    activeApplications: new Map(),

    updateStatus: (payload) =>
      set((state) => {
        const app = state.activeApplications.get(payload.applicationId);
        if (app) {
          app.status = payload.status;
          app.step = payload.step;
          app.totalSteps = payload.totalSteps;
          app.progress = payload.progress;
          app.message = payload.message;
        }
      }),

    addField: (payload) =>
      set((state) => {
        const app = state.activeApplications.get(payload.applicationId);
        if (app) {
          const existingIndex = app.fields.findIndex((f) => f.id === payload.fieldId);
          const field: ApplicationField = {
            id: payload.fieldId,
            name: payload.fieldName,
            value: payload.value,
            source: payload.source,
            confidence: payload.confidence,
            status: payload.status,
          };
          if (existingIndex >= 0) {
            app.fields[existingIndex] = field;
          } else {
            app.fields.push(field);
          }
        }
      }),

    updateScreenshot: (payload) =>
      set((state) => {
        const app = state.activeApplications.get(payload.applicationId);
        if (app) {
          app.screenshotUrl = payload.imageUrl;
          app.screenshotTimestamp = payload.timestamp;
        }
      }),

    setCaptcha: (payload) =>
      set((state) => {
        const app = state.activeApplications.get(payload.applicationId);
        if (app) {
          app.captcha = payload;
          app.status = "captcha";
        }
      }),

    clearCaptcha: (applicationId) =>
      set((state) => {
        const app = state.activeApplications.get(applicationId);
        if (app) {
          app.captcha = null;
        }
      }),

    removeApplication: (applicationId) =>
      set((state) => {
        state.activeApplications.delete(applicationId);
      }),
  })),
);
```

### 6.4 React Hook for WebSocket Integration

```tsx
// src/hooks/use-application-websocket.ts
import { useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { useApplicationStore } from "@/stores/application-store";
import { useWebSocketStatus } from "@/lib/websocket";

export function useApplicationWebSocket() {
  const { token } = useAuth();
  const wsRef = useRef<WebSocketManager | null>(null);
  const store = useApplicationStore();

  useEffect(() => {
    if (!token) return;

    const ws = new WebSocketManager(`${import.meta.env.VITE_WS_URL}/ws/applications`, token);

    ws.on("application.status_changed", store.updateStatus);
    ws.on("application.field_filled", store.addField);
    ws.on("application.screenshot_updated", store.updateScreenshot);
    ws.on("application.captcha_detected", store.setCaptcha);
    ws.on("application.captcha_resolved", ({ applicationId }) => {
      store.clearCaptcha(applicationId);
    });

    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
    };
  }, [token]);

  return {
    status: useWebSocketStatus((s) => s.status),
    send: (type: string, payload: any) => wsRef.current?.send(type, payload),
  };
}
```

### 6.5 Optimistic Updates

```tsx
// Example: Pause Application (optimistic)
function usePauseApplication() {
  const store = useApplicationStore();
  const { send } = useApplicationWebSocket();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (applicationId: string) => {
      // Optimistic: update local state immediately
      store.updateStatus({
        applicationId,
        status: "paused",
        step: store.activeApplications.get(applicationId)?.step ?? 0,
        totalSteps: store.activeApplications.get(applicationId)?.totalSteps ?? 8,
        progress: store.activeApplications.get(applicationId)?.progress ?? 0,
        message: "Paused by user",
        timestamp: new Date().toISOString(),
      });

      // Send via WebSocket (faster than REST)
      send("application.pause", { applicationId });

      // Also call REST for persistence / ack
      return fetch(`/api/applications/${applicationId}/pause`, {
        method: "POST",
      });
    },
    onError: (_, applicationId) => {
      // Rollback: re-fetch true state
      queryClient.invalidateQueries({
        queryKey: ["application", applicationId],
      });
    },
  });
}
```

---

## 7. noVNC Integration

### 7.1 VncViewer Component

```tsx
// src/components/wk/vnc-viewer.tsx
import { VncScreen } from "react-vnc";
import { useCallback, useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ConnectionStatus } from "@/components/wk/connection-status";
import { CountdownTimer } from "@/components/wk/countdown-timer";
import { useApplicationStore } from "@/stores/application-store";

interface VncViewerModalProps {
  applicationId: string;
  jobTitle: string;
  company: string;
  vncUrl: string;
  vncToken: string;
  expiresAt: string;
  onResume: () => void;
  onCancel: () => void;
}

export function VncViewerModal({
  applicationId,
  jobTitle,
  company,
  vncUrl,
  vncToken,
  expiresAt,
  onResume,
  onCancel,
}: VncViewerModalProps) {
  const [connectionStatus, setConnectionStatus] = useState<
    "connecting" | "connected" | "reconnecting" | "disconnected"
  >("connecting");
  const [quality, setQuality] = useState<"high" | "medium" | "low">("high");
  const vncRef = useRef<any>(null);

  const handleConnect = useCallback(() => {
    setConnectionStatus("connected");
  }, []);

  const handleDisconnect = useCallback(() => {
    setConnectionStatus("disconnected");
  }, []);

  const handleTimeout = useCallback(() => {
    // Application timed out -- close modal and mark as timed out
    onCancel();
  }, [onCancel]);

  return (
    <Dialog open modal>
      <DialogContent
        className="max-w-4xl w-[90vw] h-[85vh] flex flex-col p-0"
        onInteractOutside={(e) => e.preventDefault()} // Prevent closing on outside click
      >
        {/* Header */}
        <div className="p-wk-6 border-b border-wk-border-subtle">
          <DialogTitle className="wk-display-sm text-wk-primary">Attention Needed</DialogTitle>
          <DialogDescription className="wk-body-sm text-wk-secondary mt-wk-2">
            A CAPTCHA was detected on the application for:{" "}
            <span className="font-semibold text-wk-primary">
              {jobTitle} at {company}
            </span>
          </DialogDescription>
          <p className="wk-body-sm text-wk-secondary mt-wk-1">
            Please solve it below to continue your application.
          </p>
        </div>

        {/* VNC Viewer */}
        <div className="flex-1 bg-black relative overflow-hidden">
          <VncScreen
            ref={vncRef}
            url={vncUrl}
            scaleViewport
            background="black"
            style={{ width: "100%", height: "100%" }}
            rfbOptions={{
              credentials: { password: vncToken },
              wsProtocols: ["binary"],
            }}
            onConnect={handleConnect}
            onDisconnect={handleDisconnect}
            loadingUI={
              <div className="flex items-center justify-center h-full">
                <div className="text-wk-inverse wk-body-sm">Connecting to browser...</div>
              </div>
            }
          />

          {/* Instructions overlay (fades out after 5s) */}
          <div className="absolute bottom-4 left-4 right-4 text-center">
            <p className="wk-body-sm text-wk-inverse/80 bg-black/60 rounded-wk-md px-wk-4 py-wk-2 inline-block backdrop-blur">
              You are controlling the browser directly. Click and type normally to interact.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="p-wk-6 border-t border-wk-border-subtle space-y-wk-4">
          {/* Status row */}
          <div className="flex items-center justify-between">
            <ConnectionStatus status={connectionStatus} quality={quality} />
            <CountdownTimer expiresAt={expiresAt} onTimeout={handleTimeout} />
          </div>

          {/* Action buttons */}
          <div className="flex gap-wk-4">
            <Button variant="primary" size="lg" className="flex-1" onClick={onResume}>
              I've solved the CAPTCHA -- Resume Automation
            </Button>
            <Button variant="secondary" onClick={onCancel}>
              Skip this application
            </Button>
          </div>

          <p className="wk-body-sm text-wk-tertiary text-center">
            Having trouble?{" "}
            <a href="#" className="text-wk-primary underline">
              Tips for solving CAPTCHAs
            </a>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

### 7.2 Authentication Flow for VNC Session

```
1. Application WebSocket sends `captcha_detected` event
   with vncUrl and vncToken

2. Client opens VncViewerModal, passes vncUrl to <VncScreen>

3. <VncScreen> connects via WebSocket to the VNC proxy:
   ws://vnc-proxy.wekruit.com/ws/{session-id}?token={vncToken}

4. VNC proxy (websockify) validates token, bridges to
   the headless browser's VNC server

5. User interacts with remote browser, solves CAPTCHA

6. User clicks "Resume Automation":
   - Client sends POST /api/applications/{id}/resume
   - Backend checks CAPTCHA resolution (DOM monitoring)
   - Backend resumes automation pipeline
   - WebSocket sends `captcha_resolved` event
   - Modal closes, progress view resumes

7. Auto-detection fallback:
   - Backend monitors DOM for CAPTCHA element disappearance
   - If detected as resolved, sends `captcha_resolved` event
   - Client shows "CAPTCHA appears solved! Resuming in 5s..." countdown
   - Auto-resumes after countdown
```

### 7.3 VNC Session Lifecycle

```
Browser Container (Docker)
  |
  +-- Headless Chrome (with VNC server)
  |     |
  |     +-- Xvfb display :99
  |     +-- x11vnc listening on :5900
  |
  +-- websockify proxy (TCP:5900 -> WebSocket:6080)
  |
  +-- Token auth middleware (validates per-user session token)

Client
  |
  +-- <VncScreen url="ws://proxy:6080/ws/{session}" />
  |     |
  |     +-- noVNC JS client renders to <canvas>
  |     +-- Mouse/keyboard events -> VNC protocol -> browser
```

---

## 8. Testing Strategy

### 8.1 Testing Pyramid

```
                    /\
                   /  \
                  / E2E \         5-10 critical flows (Playwright)
                 /--------\
                / Component \     30-50 component stories (Storybook)
               /--------------\
              /   Integration   \  20-30 hook/store tests (Vitest)
             /--------------------\
            /     Unit Tests        \ 100+ utility/logic tests (Vitest)
           /--------------------------\
```

### 8.2 Unit Tests (Vitest)

**Setup:** Vitest shares the Vite config, so zero additional bundler setup.

```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "src/test/", "**/*.stories.tsx"],
    },
  },
});
```

**Priority targets:**

| Priority | What to Test                          | Example                                                                      |
| -------- | ------------------------------------- | ---------------------------------------------------------------------------- |
| P0       | URL validation and platform detection | `detectPlatform("https://linkedin.com/jobs/view/123")` -> `"linkedin"`       |
| P0       | Confidence score color logic          | `getConfidenceColor(94)` -> `"green"`, `getConfidenceColor(72)` -> `"amber"` |
| P0       | WebSocket message parsing             | Parse raw WS message -> typed payload                                        |
| P0       | Auth token management                 | Token storage, refresh, expiry detection                                     |
| P1       | Zustand store reducers                | `updateStatus` correctly updates application state                           |
| P1       | Form validation schemas (Zod)         | Profile fields, Q&A bank entries, URL input                                  |
| P1       | Date/time formatting utilities        | Duration formatting, relative time ("2 min ago")                             |
| P1       | Theme switching logic                 | `data-theme` attribute toggling                                              |
| P2       | Match score calculation               | Skills/Experience/Location/Education sub-scores                              |
| P2       | Notification deduplication            | Batch digest grouping logic                                                  |

### 8.3 Component Tests (React Testing Library + Vitest)

**Priority targets:**

| Priority | Component         | What to Test                                                                                      |
| -------- | ----------------- | ------------------------------------------------------------------------------------------------- |
| P0       | `Button`          | All variants render correctly, disabled state, click handler fires                                |
| P0       | `ApplicationCard` | Renders all statuses (queued, filling, reviewing, captcha), progress bar accuracy, action buttons |
| P0       | `ConfidenceScore` | Correct color for each range, tooltip content                                                     |
| P0       | `FieldLog`        | Fields appear in correct order, status icons match, scroll behavior                               |
| P0       | `VncViewerModal`  | Opens with correct props, Resume/Cancel buttons trigger callbacks, countdown displays             |
| P1       | `StatCard`        | Halant font for numbers, sub-label, sub-description                                               |
| P1       | `FileUpload`      | Drag-and-drop events, file type validation, error states                                          |
| P1       | `ModeToggle`      | Copilot/Autopilot toggle, icon switching, color change                                            |
| P1       | `DataTable`       | Sorting, filtering, pagination, row click                                                         |
| P2       | `BatchProgress`   | Progress bar calculation, count display                                                           |
| P2       | `TrustNudge`      | Renders correct content per trust level, action buttons                                           |

### 8.4 Storybook

**Setup:** Storybook 8.x with Vite builder. Stories serve as visual documentation and design system reference.

```
stories/
  ui/
    Button.stories.tsx       # All variants, sizes, states
    Card.stories.tsx
    Input.stories.tsx
    Badge.stories.tsx
    ...
  wk/
    ApplicationCard.stories.tsx
    ConfidenceScore.stories.tsx
    FieldLog.stories.tsx
    VncViewerModal.stories.tsx
    ModeToggle.stories.tsx
    StatCard.stories.tsx
    ...
  pages/
    Dashboard.stories.tsx    # Full page composition
    Settings.stories.tsx
    ...
```

**Key Storybook addons:**

- `@storybook/addon-a11y` -- Accessibility audit per story
- `@storybook/addon-themes` -- Light/dark mode switching
- `@storybook/addon-viewport` -- Mobile/tablet/desktop viewports
- `@storybook/test` -- Play functions for interaction testing

### 8.5 E2E Tests (Playwright)

**Setup:** Playwright with the Vite dev server. Test against a mock API (MSW -- Mock Service Worker).

```typescript
// playwright.config.ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: 2,
  workers: 4,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm dev",
    port: 5173,
    reuseExistingServer: !process.env.CI,
  },
});
```

**Critical E2E flows (P0):**

| #   | Flow                                   | Steps                                                                                                                                                                                                                 | Success Criteria                                        |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1   | **Google OAuth sign-in**               | Visit /login -> Click "Continue with Google" -> Mock OAuth callback -> Verify redirect to onboarding or dashboard                                                                                                     | User lands on correct page based on onboarding status   |
| 2   | **Onboarding complete flow**           | Upload resume -> Wait for parse -> Quick review (verify fields) -> Click "Looks Good" -> Verify dashboard first-time state                                                                                            | Dashboard shows "Paste a job URL" CTA                   |
| 3   | **New application happy path**         | Paste LinkedIn URL -> Verify platform detection badge -> Verify job preview loads -> Verify pre-fill table -> Click "Start Application" -> Verify redirect to progress view                                           | Application appears in progress view                    |
| 4   | **Application progress to completion** | Mock WebSocket messages for each step -> Verify stepper updates -> Verify field log entries appear -> Verify screenshot updates -> Verify review screen shows -> Click "Approve and Submit" -> Verify complete screen | Green checkmark, confirmation screenshot, field summary |
| 5   | **CAPTCHA takeover flow**              | Mock captcha_detected WebSocket message -> Verify modal opens with VNC placeholder -> Click "Resume Automation" -> Verify modal closes -> Verify progress resumes                                                     | Application continues after CAPTCHA                     |
| 6   | **Settings: Automation preferences**   | Navigate to Settings -> Automation -> Switch to Autopilot -> Verify Autopilot settings appear -> Adjust confidence slider -> Save -> Verify toast confirmation                                                        | Settings persisted (mock API call verified)             |
| 7   | **Dashboard with active applications** | Mock 3 active applications at different statuses -> Verify cards render with correct progress/status -> Click "View" -> Verify navigation to progress view                                                            | All 3 cards render correctly                            |
| 8   | **Theme toggle**                       | Toggle dark mode -> Verify `data-theme="dark"` on root -> Verify visual change (screenshot comparison) -> Toggle back -> Verify light mode                                                                            | Colors switch correctly                                 |

**Secondary E2E flows (P1):**

| #   | Flow                                                                    |
| --- | ----------------------------------------------------------------------- |
| 9   | Application failure -> error screen -> retry                            |
| 10  | Autopilot batch flow -> batch progress bar -> live feed -> view summary |
| 11  | Q&A Bank: add custom question, edit answer, delete entry                |
| 12  | Connected Accounts: connect LinkedIn (mock secure browser), disconnect  |
| 13  | Billing: view current plan, view usage, navigate to Stripe portal       |
| 14  | Mobile responsive: verify sidebar collapse, FAB, stacked cards          |

### 8.6 Mock Strategy

**MSW (Mock Service Worker)** for both Storybook and Playwright:

```typescript
// src/test/mocks/handlers.ts
import { http, HttpResponse } from "msw";

export const handlers = [
  // Dashboard stats
  http.get("/api/dashboard/stats", () => {
    return HttpResponse.json({
      totalApplied: 127,
      successRate: 91,
      avgTime: "1m 42s",
      thisWeek: 23,
      thisWeekDelta: +5,
    });
  }),

  // Active applications
  http.get("/api/applications", ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get("status");
    if (status === "active") {
      return HttpResponse.json([
        {
          id: "app-1",
          jobTitle: "Senior SWE",
          company: "Stripe",
          status: "filling",
          progress: 65,
          step: 5,
          totalSteps: 8,
        },
        // ... more mock data
      ]);
    }
    // ... recent applications
  }),

  // Resume upload
  http.post("/api/resume/upload", async () => {
    return HttpResponse.json({
      id: "resume-1",
      filename: "resume_v3.pdf",
      parsedData: {
        name: "Adam Smith",
        email: "adam@gmail.com",
        phone: "+1 555-123-4567",
        // ... parsed fields
      },
    });
  }),
];
```

### 8.7 CI Pipeline

```yaml
# .github/workflows/frontend.yml
name: Frontend CI

on:
  pull_request:
    paths:
      - "packages/web/**"
      - "packages/ui/**"

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm type-check

  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm test -- --coverage
      - uses: codecov/codecov-action@v4

  e2e:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm exec playwright install --with-deps
      - run: pnpm test:e2e
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/

  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - uses: actions/upload-artifact@v4
        with:
          name: dist
          path: packages/web/dist/
```

---

## Appendix A: Key File Structure

```
wekruit-dashboard/
  packages/
    web/
      index.html
      vite.config.ts
      tailwind.config.ts
      vitest.config.ts
      playwright.config.ts
      tsconfig.json

      public/
        favicon.ico
        fonts/
          Halant-*.woff2
          Geist-*.woff2

      src/
        main.tsx                        # App entry point
        globals.css                     # WeKruit tokens + Tailwind imports

        components/
          ui/                           # shadcn/ui base components (50+ files)
          wk/                           # WeKruit-specific components
          layout/                       # Layout components (sidebar, nav, etc.)

        routes/                         # File-based routing
          __root.tsx
          _auth/
          _onboarding/
          _dashboard/

        hooks/
          use-auth.ts
          use-theme.ts
          use-application-websocket.ts
          use-debounce.ts
          use-media-query.ts

        stores/
          application-store.ts          # Zustand: real-time application state
          dashboard-store.ts            # Zustand: UI state (filters, view mode)

        lib/
          api.ts                        # TanStack Query + ky HTTP client
          auth.ts                       # Auth guards, token management
          websocket.ts                  # WebSocket manager
          utils.ts                      # General utilities
          platform-detection.ts         # URL -> platform matching
          confidence.ts                 # Confidence score helpers

        types/
          api.ts                        # API response types
          websocket.ts                  # WebSocket message types
          application.ts                # Application domain types

        test/
          setup.ts                      # Test setup (MSW, RTL matchers)
          mocks/
            handlers.ts                 # MSW request handlers

      e2e/
        auth.spec.ts
        onboarding.spec.ts
        dashboard.spec.ts
        application-flow.spec.ts
        captcha.spec.ts
        settings.spec.ts

    ui/                                 # Shared design system package
      src/
        tokens.css
        components/                     # Publishable component library (future)

    email/                              # React Email templates
      src/
        templates/
          welcome.tsx
          application-submitted.tsx
          captcha-alert.tsx
          batch-digest.tsx
```

---

## Appendix B: Migration Path from shadcn-admin

### Week 1: Fork and Re-theme

1. Fork `satnaing/shadcn-admin` into `wekruit-dashboard` repo.
2. Replace `globals.css` with WeKruit token system (Section 2.2).
3. Update `tailwind.config.ts` with WeKruit theme extension (Section 2.3).
4. Add Halant + Geist fonts (Google Fonts or self-hosted woff2).
5. Update sidebar navigation structure to match WeKruit IA.
6. Replace Inter font references with Geist.
7. Add `data-theme="dark"` toggle (replace Tailwind `dark:` class strategy).
8. Verify all existing shadcn-admin pages render correctly with new theme.

### Week 2: Custom Components + Infrastructure

1. Build WeKruit-specific components (StatCard, ApplicationCard, ConfidenceScore, etc.).
2. Set up WebSocket infrastructure (manager, Zustand store, hooks).
3. Set up TanStack Query with API client.
4. Set up MSW for development mocking.
5. Set up Storybook with all base components documented.

### Weeks 3-6: Core Screens

1. Dashboard (main screen with stats, active apps, recent table).
2. Onboarding flow (3-step revised flow).
3. New Application flow (URL input, preview, start).
4. Application Progress view (real-time field log + screenshot).

### Weeks 7-10: Complex Features

1. CAPTCHA/VNC takeover modal (react-vnc integration).
2. Review screen (Copilot pre-submit review).
3. Application Complete screen.
4. Settings pages (all 7 sub-pages).

### Weeks 11-14: Autopilot + Polish

1. Autopilot dashboard view (batch progress, live feed).
2. Mode selection UI + trust gate logic.
3. Notification integration (Novu inbox, Sonner toasts).
4. Billing integration (Stripe components).
5. E2E test suite.
6. Performance optimization (code splitting, lazy loading).
7. Accessibility audit and fixes.

---

_End of Frontend Implementation Plan. This document should be reviewed alongside 02_user_flows_and_ux_design.md and 05_autopilot_ux_onboarding.md for the complete design context. Implementation should begin with the Week 1 migration path described in Appendix B._
