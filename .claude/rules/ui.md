# UI Rules

## Stack

- Tailwind CSS v4 — use utility classes, no custom CSS unless necessary.
- React Server Components by default — only use `'use client'` when interactivity is needed.
- No external UI component libraries unless explicitly requested.

## Theming

- Support dark and light modes via Tailwind's `dark:` variant.
- PHP site uses CSS variables (`--bg`, `--text`, etc.) — Node.js uses Tailwind dark mode.
- Never hardcode colors — always use Tailwind theme tokens.

## Responsiveness

- Every page must be mobile-responsive — match the PHP version's breakpoints.
- Test at minimum: mobile (375px), tablet (768px), desktop (1280px).
- Use Tailwind responsive prefixes: `sm:`, `md:`, `lg:`, `xl:`.

## Layout Components

- Shared layout in `components/layout/` — header, footer, sidebar.
- Admin layout at `app/admin/layout.tsx` — sidebar + auth check.
- Public layout at `app/[locale]/layout.tsx` — header + footer + locale.

## Admin Panel

- Admin pages use the sidebar from `components/admin/`.
- All admin pages require auth — handled by `app/admin/layout.tsx`.
- Toast notifications for success/error feedback.
- Tables should be sortable and paginated where the PHP version has this.

## Accessibility

- All form inputs must have labels.
- All images must have alt text.
- Interactive elements must be keyboard-navigable.
- Use semantic HTML (`<nav>`, `<main>`, `<article>`, `<section>`).

## Parity Verification

After any UI change:
- [ ] Compare visually against PHP version at same viewport
- [ ] Check dark mode and light mode
- [ ] Check all three languages render correctly
- [ ] Check mobile responsiveness
