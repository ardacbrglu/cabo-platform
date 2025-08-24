export default function NotificationBadge({ show, size = 11, style }) {
  if (!show) return null;
  return (
    <span
      style={{
        width: size,
        height: size,
        minWidth: size,
        minHeight: size,
        background: "#ff5555",
        border: "3px solid #181818",
        borderRadius: "9999px",
        display: "inline-block",
        position: "absolute",
        top: "-5px",
        right: "-4px",
        ...style,
      }}
      className="animate-pulse"
      aria-hidden="true"
    />
  );
}
