const P: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 10v9.5h13V10',
  spend: 'M4 6h16M4 12h16M4 18h10',
  bills: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  wealth: 'M3 7h15a3 3 0 0 1 3 3v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l11-3v3M16 14h2',
  aware: 'M12 3v2M5 12H3M21 12h-2M6.3 6.3 4.9 4.9M17.7 6.3l1.4-1.4M8.5 16.5a5 5 0 1 1 7 0c-.8.8-1 1.5-1 2.5h-5c0-1-.2-1.7-1-2.5zM10 21h4',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z',
  work: 'M4 8h16v11H4zM9 8V5h6v3M4 13h16',
  upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.7 7.7 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.5 7.5 0 0 0-1.7-1L15 3.4h-4l-.3 2.6a7.5 7.5 0 0 0-1.7 1l-2.4-1-2 3.4 2 1.6a7.7 7.7 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.5 7.5 0 0 0 1.7 1l.3 2.6h4l.3-2.6a7.5 7.5 0 0 0 1.7-1l2.4 1 2-3.4z',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  plus: 'M12 5v14M5 12h14',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chev: 'm9 6 6 6-6 6',
  left: 'm15 6-6 6 6 6',
  right: 'm9 6 6 6-6 6',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  edit: 'M4 20h4L19 9l-4-4L4 16z',
  check: 'm5 12 5 5 9-10',
  sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
};
export function Icon({ n }: { n: keyof typeof P | string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[n] ?? ''} />
    </svg>
  );
}
/** Wakeful mark: a seated Buddha in a halo. Used in the header and as the app icon only. */
export const Logo = () => (
  <svg viewBox="0 0 64 64" aria-hidden>
    <circle cx="32" cy="32" r="28" fill="none" stroke="var(--accent)" strokeWidth="2.2" />
    <g fill="var(--text)">
      <ellipse cx="32" cy="19.6" rx="4.9" ry="5.7" /><circle cx="32" cy="13.4" r="1.8" />
      <path d="M28.8 25.6Q32 25 35.2 25.6C41 26 43.5 27.5 43.5 29.5L48 47H16L20.5 29.5C20.5 27.5 23 26 28.8 25.6Z" />
      <ellipse cx="32" cy="47.6" rx="19.8" ry="5.2" />
    </g>
  </svg>
);
