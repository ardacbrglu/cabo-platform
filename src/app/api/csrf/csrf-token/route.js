export const dynamic = "force-dynamic";
export async function GET() {
  // SECURITY REVIEW: Exposing the raw CSRF secret to the client is a critical vulnerability.
  // Never send the actual CSRF secret to the frontend. Instead, generate a random token per session/user and validate it server-side.
  // Always set a strong CSRF_SECRET in production and never use the fallback default.
  const csrfToken = process.env.CSRF_SECRET || "CSRF_SECRET_DEFAULT";

  // SECURITY REVIEW: Do NOT return the secret as the CSRF token. Use a securely generated random value instead.
  return new Response(JSON.stringify({ csrfToken }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
