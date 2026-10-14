import { useId } from "react";

/** App mark: a hex-nut magnifier ("find the part") on the primary-blue badge. */
export function LogoMark({ className }: { className?: string }) {
  const gradientId = `logo-mark-${useId()}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <defs>
        <linearGradient
          id={gradientId}
          x1="0"
          y1="0"
          x2="0"
          y2="64"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#2256BB" />
          <stop offset="1" stopColor="#1B4699" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill={`url(#${gradientId})`} />
      <g stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
        <path d="M28 12.91L41.5 20.71V36.29L28 44.09L14.5 36.29V20.71Z" strokeWidth="5" />
        <circle cx="28" cy="28.5" r="5.5" strokeWidth="5" />
        <path d="M38.25 38.75L50 50.5" strokeWidth="5.5" />
      </g>
    </svg>
  );
}
