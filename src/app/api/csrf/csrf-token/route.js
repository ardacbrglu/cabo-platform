export async function GET() {
  const csrfToken = process.env.CSRF_SECRET || "CSRF_SECRET_DEFAULT";

  return new Response(JSON.stringify({ csrfToken }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
