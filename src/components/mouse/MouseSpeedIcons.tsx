interface IconProps {
  className?: string;
}

const iconClass = "h-4 w-4 shrink-0";

function TurtleIcon({ className = iconClass, scale }: IconProps & { scale: "small" | "large" }) {
  const shell =
    scale === "small"
      ? { cx: 12, cy: 13, rx: 4.5, ry: 3.25 }
      : { cx: 12, cy: 12.5, rx: 6.5, ry: 4.75 };

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
      <ellipse cx={shell.cx} cy={shell.cy} rx={shell.rx} ry={shell.ry} />
      <path d="M8.5 11.5c1-1.5 2.25-2.25 3.5-2.25s2.5.75 3.5 2.25" />
      <path d="M10 15.5l-1.25 1.5M14 15.5l1.25 1.5" />
      <circle cx={shell.cx - shell.rx - 1.25} cy={shell.cy - 0.5} r="1.1" />
      <path d={`M${shell.cx - shell.rx - 0.25} ${shell.cy - 1.25}v1.5`} />
    </svg>
  );
}

function RabbitIcon({ className = iconClass, scale }: IconProps & { scale: "small" | "large" }) {
  const body =
    scale === "small"
      ? { cx: 12.5, cy: 14.5, rx: 3.25, ry: 2.75, earH: 4.5 }
      : { cx: 12, cy: 14, rx: 4.75, ry: 3.5, earH: 6 };

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
      <ellipse cx={body.cx} cy={body.cy} rx={body.rx} ry={body.ry} />
      <path d={`M${body.cx - 1.5} ${body.cy - body.ry - body.earH}v${body.earH}`} />
      <path d={`M${body.cx + 1.5} ${body.cy - body.ry - body.earH}v${body.earH}`} />
      <circle cx={body.cx + body.rx + 0.75} cy={body.cy - 0.25} r="1.1" />
      <path d={`M${body.cx + body.rx + 1.75} ${body.cy}h1.75`} />
      <path d={`M${body.cx - 1.25} ${body.cy + body.ry + 1.25}l-1 1.25M${body.cx + 1.25} ${body.cy + body.ry + 1.25}l1 1.25`} />
    </svg>
  );
}

export function VerySlowSpeedIcon({ className = iconClass }: IconProps) {
  return <TurtleIcon className={className} scale="small" />;
}

export function SlowSpeedIcon({ className = iconClass }: IconProps) {
  return <TurtleIcon className={className} scale="large" />;
}

export function MediumSpeedIcon({ className = iconClass }: IconProps) {
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
      <circle cx="12" cy="5.5" r="2.25" />
      <path d="M12 7.75v5.5" />
      <path d="M9.25 20.5l2.75-7.25 2.75 7.25" />
      <path d="M8.5 12.25h7" />
    </svg>
  );
}

export function FastSpeedIcon({ className = iconClass }: IconProps) {
  return <RabbitIcon className={className} scale="small" />;
}

export function VeryFastSpeedIcon({ className = iconClass }: IconProps) {
  return <RabbitIcon className={className} scale="large" />;
}
