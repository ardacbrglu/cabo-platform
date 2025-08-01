export function validateFile(file, allowedTypes = ["image/jpeg", "image/png"], maxSize = 2 * 1024 * 1024) {
  if (!allowedTypes.includes(file.mimetype)) return false;
  if (file.size > maxSize) return false;
  return true;
}
