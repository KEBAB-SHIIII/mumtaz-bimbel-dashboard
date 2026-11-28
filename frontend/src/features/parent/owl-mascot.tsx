/** Maskot burung hantu kecil untuk kartu ringkasan belajar (satu-satunya ilustrasi portal Orang Tua). */
export function OwlMascot({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false" className={className}>
      <ellipse cx="50" cy="60" rx="32" ry="34" fill="#f2b76c" />
      <ellipse cx="50" cy="68" rx="20" ry="22" fill="#fbe1b6" />
      <circle cx="37" cy="45" r="12" fill="#fff" />
      <circle cx="63" cy="45" r="12" fill="#fff" />
      <circle cx="38" cy="46" r="5" fill="#0b1f3b" />
      <circle cx="62" cy="46" r="5" fill="#0b1f3b" />
      <path d="M46 54 50 60 54 54z" fill="#e08a2c" />
      <path d="M22 30 32 38M78 30 68 38" stroke="#c8873a" strokeWidth="5" strokeLinecap="round" />
      <path d="M28 88h44" stroke="#8b5a2b" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
