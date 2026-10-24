export default function Logo({ size = 26 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="9" fill="#17160f" />
      <path d="M8 24V9M8 17c0-5 4-5 8-5s8 0 8-3M8 17c0 4 4 5 8 5s8 1 8 3" fill="none" stroke="#f5f2ea" strokeWidth="2" strokeLinecap="round" />
      <circle cx="24" cy="9" r="2.6" fill="#ee4a1c" />
    </svg>
  );
}
