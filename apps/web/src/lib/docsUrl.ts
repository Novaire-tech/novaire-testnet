/**
 * Canonical documentation destination for the navbar "Docs" link and the
 * hero "Read more" CTA. Defaults to the site's internal /docs route so the
 * links never go dead. Once the Mintlify project in apps/docs is deployed,
 * set NEXT_PUBLIC_DOCS_URL to its live URL (e.g. https://docs.novaire.xyz)
 * to point both entry points at it — no other code change needed.
 */
export const DOCS_URL = process.env.NEXT_PUBLIC_DOCS_URL || "/docs";
