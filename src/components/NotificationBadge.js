// src/components/NotificationBadge.jsx
export default function NotificationBadge({
  show,
  size = 11,
  bgColor = "#ff5555",
  borderColor = "#181818",
  offsetX = -4,   // right offset (px, negative = dışa doğru)
  offsetY = -4,   // top offset
  style,
}) {
  if (!show) return null;
  return (
    <span
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        background: bgColor,
        border: `2px solid ${borderColor}`,
        borderRadius: "9999px",
        display: "inline-block",
        position: "absolute",
        top: `${offsetY}px`,
        right: `${offsetX}px`,
        pointerEvents: "none",
        ...style,
      }}
      className="animate-pulse"
      aria-hidden="true"
    />
  );
}
