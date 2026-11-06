# Security Policy

## Supported Versions

SangeetPremi is an active open-source project under development. Security updates are applied to the active branch (`main`).

| Version | Supported          | Status |
| ------- | ------------------ | ------ |
| 0.1.x (`main`) | :white_check_mark: | Active Development |
| < 0.1.0 | :x:                | Unsupported |

## Reporting a Vulnerability

We take the security and privacy of our users seriously.

If you discover a security vulnerability or privacy flaw in SangeetPremi, please report it **responsibly and privately** rather than opening a public issue.

### Preferred Disclosure Method

Please report security advisories directly through GitHub's Private Vulnerability Reporting:

1. Navigate to the repository's **Security** tab: [https://github.com/SPOOKEYfr/sangeetpremi/security](https://github.com/SPOOKEYfr/sangeetpremi/security)
2. Click **Advisories** &rarr; **Report a vulnerability** (or go to [https://github.com/SPOOKEYfr/sangeetpremi/security/advisories/new](https://github.com/SPOOKEYfr/sangeetpremi/security/advisories/new)).
3. Provide a detailed summary, including:
   - Type of vulnerability (e.g. XSS, credential leakage, permission bypass).
   - Step-by-step reproduction instructions or proof-of-concept.
   - Browser version and environment details.
   - Proposed remediation, if known.

This ensures the maintainers can evaluate, verify, and resolve the vulnerability before any public disclosure.

## Security & Privacy Architecture

SangeetPremi is built with privacy-by-design and local-first principles:

1. **Zero Hardcoded Secrets**: The repository contains no API keys, OAuth secrets, client tokens, or third-party credentials.
2. **On-Device Storage**: User credentials (YouTube API key, optional OAuth client ID) and discovery libraries are stored exclusively in the browser's local sandbox (`chrome.storage.local`).
3. **No External Telemetry**: SangeetPremi sends zero telemetry, analytics, or behavioral tracking to any third-party server.
4. **Official YouTube API Only**: Network requests to YouTube are routed strictly through the official Google YouTube Data API v3 (`https://www.googleapis.com/youtube/v3/*`). The extension does not perform browser audio extraction or circumvent YouTube terms.
5. **Content Security & Sanitization**: All external data (video titles, descriptions, channel names) are strictly escaped with `escapeHtml` before rendering, mitigating Cross-Site Scripting (XSS).
