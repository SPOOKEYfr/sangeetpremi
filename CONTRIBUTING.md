# Contributing to SangeetPremi

Thank you for your interest in contributing to **SangeetPremi**!

SangeetPremi is an open-source, intelligent music discovery and playlist generation browser extension created and maintained by **SPOOKEYfr**. We welcome contributions from developers, designers, and music enthusiasts.

---

## Code of Conduct

All contributors and participants are expected to adhere to our [Code of Conduct](CODE_OF_CONDUCT.md). Please treat fellow contributors with respect and empathy.

---

## Getting Started

### Prerequisites

- **Node.js**: `18.0.0` or higher (Node 20+ recommended)
- **npm**: `9.0.0` or higher
- **Chromium browser**: Google Chrome, Brave, Microsoft Edge, or Chromium for unpacked extension loading
- **Git**: standard command-line Git

### Local Setup

1. Fork the repository on GitHub: [https://github.com/SPOOKEYfr/sangeetpremi](https://github.com/SPOOKEYfr/sangeetpremi)
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/sangeetpremi.git
   cd sangeetpremi
   ```
3. Install development dependencies:
   ```bash
   npm install
   ```

---

## Development Workflow

### Available Scripts

| Command | Purpose |
| ------- | ------- |
| `npm run dev` | Starts Vite dev server with Hot Module Replacement for dashboard prototyping |
| `npm run build` | Runs TypeScript strict check (`tsc --noEmit`) and builds production output into `dist/` |
| `npm test` | Runs the automated unit test suite via Vitest |
| `npm run test:watch` | Runs Vitest in watch mode for test-driven development |
| `npm run lint` | Runs TypeScript type checking across the entire project |
| `npm run package` | Builds and creates a distribution `.zip` archive ready for testing |

### Testing in the Browser (Unpacked Extension)

To load and test your build in Chrome, Brave, or Edge:

1. Run the build script:
   ```bash
   npm run build
   ```
2. Navigate to `chrome://extensions` in your browser.
3. Toggle **Developer mode** in the top-right corner.
4. Click **Load unpacked** and select the `dist/` folder in your repository root.
5. The SangeetPremi icon will appear in your browser extension toolbar.
6. Click the extension icon to view the popup, open the side panel, or open the full Dashboard via Options.

### YouTube Data API Testing

Live music discovery requires a valid YouTube Data API v3 key:
- Refer to [`docs/SETUP_YOUTUBE_API.md`](docs/SETUP_YOUTUBE_API.md) for step-by-step instructions.
- Enter your key in **Settings &rarr; YouTube connection** inside the extension.
- **Never commit your API key, client secrets, or OAuth credentials.**

---

## Code Standards & Architecture Guidelines

To keep SangeetPremi fast, reliable, and secure, all contributions must adhere to the following principles:

### 1. TypeScript Strictness
- Strict mode is enabled (`"strict": true` in `tsconfig.json`).
- Avoid using `any`. Use well-defined types or generics from `src/types/index.ts`.
- Ensure all types pass `npm run lint`.

### 2. Zero Runtime Dependencies
- SangeetPremi is designed to be lightweight. The runtime extension has **zero external runtime dependencies**.
- Avoid introducing heavy third-party UI libraries or frameworks without prior discussion in an issue.

### 3. Security & DOM Sanitization
- All external strings (titles, artist names, descriptions, channel labels) must pass through `escapeHtml()` or use `textContent` before DOM insertion.
- Never write raw unescaped strings directly into `innerHTML`.
- Never execute external scripts or evaluate dynamic strings (`eval`).

### 4. Pure Discovery & Business Logic
- Logic for normalization (`src/utils/normalize.ts`), deduplication (`src/services/discovery/dedup.ts`), and classification (`src/services/discovery/classify.ts`) must remain pure, side-effect-free, and covered by unit tests in `tests/`.
- Network calls are strictly encapsulated within `src/services/youtube/api.ts` with local rate-limiting and quota tracking.

### 5. Design System Consistency
- SangeetPremi uses a custom **Claymorphism Dark Design System**:
  - Primary accent: Lavender/violet (`#A78BF2` / `#8B7CF6`)
  - Secondary accent: Coordinated purple (`#BBA9F5`) and teal (`#5FD4C4`)
  - Surfaces: Deep graphite (`#101115`, `#14151B`, `#191A20`)
  - Use tokens defined in `src/styles/tokens.css` and primitives from `src/styles/components.css`.

---

## Submitting Changes

### Pull Request Process

1. Create a descriptive feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```
2. Make focused, well-documented changes.
3. Verify that tests pass and the production build compiles cleanly:
   ```bash
   npm test
   npm run build
   ```
4. Update [`docs/PROJECT_STATUS.md`](docs/PROJECT_STATUS.md) if your changes complete or modify roadmap milestones.
5. Commit with clear, descriptive commit messages.
6. Push to your fork and submit a Pull Request against the `main` branch.
7. Fill out the provided [Pull Request Template](.github/PULL_REQUEST_TEMPLATE.md).

---

## Reporting Issues & Requesting Features

- **Bug Reports**: Please open an issue using the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.yml) and include complete reproduction steps, browser version, and console logs.
- **Feature Requests**: Please use the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.yml) to outline the proposed enhancement, use case, and rationale.
- **Security Disclosures**: Please follow our [Security Policy](SECURITY.md) via GitHub Private Vulnerability Reporting.
