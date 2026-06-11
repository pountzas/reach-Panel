interface IconProps {
  className?: string;
}

const iconClass = "h-6 w-6";

function MouseBody() {
  return (
    <>
      <path d="M8 4.5A4.5 4.5 0 0 1 12.5 0H13a4 4 0 0 1 4 4v8.5a6.5 6.5 0 0 1-13 0V8a3.5 3.5 0 0 1 3.5-3.5Z" />
      <path d="M12.5 0v7.5" />
    </>
  );
}

export function LeftClickIcon({ className = iconClass }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <MouseBody />
      <path
        d="M8 4.5A4.5 4.5 0 0 1 12.5 0V7.5H8V8a3.5 3.5 0 0 0-3.5 3.5V4.5Z"
        fill="currentColor"
        stroke="none"
        opacity="0.35"
      />
    </svg>
  );
}

export function DoubleClickIcon({ className = iconClass }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <MouseBody />
      <path d="M9 17.5h6" />
      <path d="M10.5 20h3" opacity="0.6" />
    </svg>
  );
}

export function RightClickIcon({ className = iconClass }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <MouseBody />
      <path
        d="M12.5 0H13a4 4 0 0 1 4 4v3.5H12.5V0Z"
        fill="currentColor"
        stroke="none"
        opacity="0.35"
      />
    </svg>
  );
}

export function DragLockIcon({ className = iconClass }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

export function PrecisionIcon({ className = iconClass }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      className={className}
      aria-hidden
    >
      <circle cx="12" cy="12" r="7" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function ScrollIcon({ className = iconClass }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <path d="M12 3v14M8.5 13.5 12 17l3.5-3.5" />
    </svg>
  );
}
