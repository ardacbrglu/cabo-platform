export const dynamic = "force-dynamic";
// app/api/logout/route.js
import { csrf } from '@/lib/csrf';

// SECURITY REVIEW: This route uses the csrf middleware. Ensure the CSRF secret is strong and not default. Consider per-session/user tokens for higher security.

const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';

export const POST = csrf(async (req) => {
  // SECURITY REVIEW: All state-changing logic is protected by CSRF here. Keep this for all sensitive endpoints.
  return new Response(null, {
    status: 200,
    headers: {
      'Set-Cookie': `cabo_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${secureFlag}`
    }
  });
});

// Eğer GET ile de logout’a izin verecekseniz, CSRF’le koruyun:
export const GET = POST;
