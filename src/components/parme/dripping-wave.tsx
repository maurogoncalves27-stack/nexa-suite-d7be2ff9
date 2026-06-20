export function DrippingWave({ color = "#ef6b3a", bg = "#fff7e6" }: { color?: string; bg?: string }) {
  return (
    <div aria-hidden style={{ background: bg }}>
      <svg viewBox="0 0 1440 180" preserveAspectRatio="none" className="block h-28 w-full md:h-36">
        <path
          d="M0,105 C 48,105 96,75 144,75 C 192,75 240,105 288,105 C 336,105 384,75 432,75 C 480,75 528,105 576,105 C 624,105 672,75 720,75 C 768,75 816,105 864,105 C 912,105 960,75 1008,75 C 1056,75 1104,105 1152,105 C 1200,105 1248,75 1296,75 C 1344,75 1392,105 1440,105 L 1440,180 L 0,180 Z"
          fill={color}
        />
      </svg>
    </div>
  );
}
