---
status: "accepted"
date: 2026-08-10
---
# Use React, Vite, Tailwind CSS, and shadcn/ui for the Frontend Dashboard

## Context and Problem Statement

The MCP Router needs a web-based management dashboard for configuring upstream servers, creating API keys, managing tool permissions, and viewing audit logs. The dashboard runs inside the same Docker container as the backend, served as static files by Hono. It needs to feel modern, interactive, and responsive.

## Decision Drivers

* Rich interactive UI needed — permission matrix with checkboxes, real-time server status, multi-step dialogs
* Modern, polished aesthetics with minimal custom CSS effort
* Strong TypeScript support for type-safe API interactions
* Single-container deployment — frontend must be built to static files and served by the backend
* Developer familiarity and large component ecosystem
* Accessible, well-tested UI primitives (not reinventing buttons, dialogs, tables)

## Considered Options

* React + Vite + Tailwind CSS v4 + shadcn/ui — Modern SPA with utility-first styling and a copy-paste component library of accessible, customizable primitives. Built to static files via Vite.
* Server-side rendered TSX + HTMX — Minimal client JS, server-rendered pages with HTMX for interactivity. No build step needed. But limited interactivity for complex UIs like the permission matrix.
* Vue + Vite + PrimeVue — Vue ecosystem with a comprehensive component library. Solid option but team has more React experience.
* Plain HTML + vanilla JS — No framework overhead. But enormous effort to build an interactive permission matrix, real-time status updates, and multi-step forms from scratch.

## Decision Outcome

Chosen option: "React + Vite + Tailwind CSS v4 + shadcn/ui", because it provides the richest interactive experience for complex UI patterns (permission matrix, multi-step server setup wizard, real-time status badges). shadcn/ui provides accessible, well-tested component primitives (Table, Dialog, Form, Switch, Checkbox, Badge, Sidebar) that can be customized via Tailwind. Vite builds the SPA to static files that Hono serves via `serveStatic`.

### Consequences

* Good, because rich interactivity for complex UI patterns (permission matrix, drag-and-drop, real-time updates)
* Good, because shadcn/ui provides 30+ accessible, composable components — no need to build primitives from scratch
* Good, because Tailwind CSS v4 enables rapid, consistent styling with design tokens
* Good, because Vite provides fast HMR during development and optimized production builds
* Good, because strong TypeScript support — type-safe API calls with `@tanstack/react-query`
* Neutral, because requires a build step (Vite) which adds a stage to the Docker multi-stage build
* Bad, because adds ~200KB+ of client-side JavaScript for a dashboard that may only have one user
* Bad, because separate frontend build pipeline increases Docker image build time

## Pros and Cons of the Options

### React + Vite + Tailwind CSS v4 + shadcn/ui

Build a single-page application (SPA) using React 18+, Vite as the build tool, Tailwind CSS v4 for utility-first styling, and shadcn/ui for accessible, unstyled Radix-based component primitives. Compile the output into static HTML/JS/CSS assets to be served by Hono.

* Good, because Radix UI primitives underlying shadcn/ui provide accessible keyboard navigation, focus management, and screen-reader support out of the box.
* Good, because shadcn/ui code lives directly inside the project repository, allowing complete customization of styles and component behaviors without library lock-in.
* Good, because Vite offers extremely fast build speeds, HMR, and straightforward configuration for bundling static single-page applications.
* Good, because React's declarative state management simplifies handling complex UI interactions like multi-select matrices, optimistic UI updates, and real-time SSE event feeds.
* Good, because integration with `@tanstack/react-query` delivers effortless client-side caching, background revalidation, and loading state management.
* Neutral, because requiring a frontend build toolchain introduces node_modules complexity and build configuration to the frontend directory.
* Bad, because client-side JavaScript bundle sizes (~200KB+ gzipped) are larger than server-rendered alternatives.
* Bad, because Docker multi-stage builds require a dedicated Node build phase for Vite before copying static assets to the final runner image.

### Server-side rendered TSX + HTMX

Use Hono's native JSX/TSX engine to render HTML pages on the server and use HTMX attributes (`hx-get`, `hx-post`, `hx-swap`) for dynamic page updates and interactions.

* Good, because it eliminates client-side build pipelines and bundle size entirely; the backend directly outputs HTML.
* Good, because it simplifies the stack by sharing code directly between server routes and view templates without separate frontend state management.
* Good, because initial page load performance is fast with zero client-side JavaScript initialization phase.
* Bad, because implementing highly interactive components (such as an inline matrix of server/tool permission checkboxes, multi-step wizard dialogs, or client-side filter sorting) with HTMX is cumbersome and leads to fragmented server endpoint logic.
* Bad, because real-time state synchronization for active SSE connections and live server health updates requires extra SSE/WebSockets extensions in HTMX that are less flexible than React hooks.
* Bad, because UI component libraries for HTMX are sparse compared to the rich React/Tailwind ecosystem.

### Vue + Vite + PrimeVue

Build a single-page application using Vue 3, Vite, and the PrimeVue component library for UI elements.

* Good, because Vue 3 offers excellent performance, simple reactive state primitives (`ref`, `reactive`), and clean single-file components.
* Good, because PrimeVue provides a vast array of pre-built, feature-rich components including advanced data tables and form controls.
* Neutral, because Vue and PrimeVue fulfill all technical requirements equally well as React and shadcn/ui.
* Bad, because the team has significantly more experience with React, TypeScript, and shadcn/ui, making Vue a higher friction choice for rapid development and maintenance.

### Plain HTML + vanilla JS

Build the dashboard using plain static HTML files, CSS stylesheets, and vanilla JavaScript using `fetch()` and DOM manipulation.

* Good, because it requires zero dependencies, zero build steps, and zero framework overhead.
* Good, because total bundle size is minimal and execution is lightweight.
* Bad, because managing complex DOM state manually for permission matrices, multi-step modal dialogs, and real-time status indicators leads to fragile, imperative code.
* Bad, because lack of component abstraction makes UI reuse difficult and leads to duplicated markup across pages.
* Bad, because custom UI components must be implemented from scratch, including accessibility features, keyboard traps, and ARIA roles.

## More Information

Key shadcn/ui components to install: `table`, `card`, `dialog`, `form`, `switch`, `checkbox`, `badge`, `tabs`, `dropdown-menu`, `sidebar`, `sheet`, `sonner`, `select`, `command`, `skeleton`, `scroll-area`. See ADR-0002 for how Hono serves the built SPA.
