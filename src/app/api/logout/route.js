export const dynamic = "force-dynamic";
// app/api/logout/route.js
import { csrf } from '@/lib/csrf';

const secureFlag = process.env.NODE_ENV === 'production' ? '; Secure' : '';

export const POST = csrf(async (req) => {
  return new Response(null, {
    status: 200,
    headers: {
      'Set-Cookie': `cabo_token=; HttpOnly; Path=/; Max-Age=0; SameSite=Strict${secureFlag}`
    }
  });
});

// Eğer GET ile de logout’a izin verecekseniz, CSRF’le koruyun:
export const GET = POST;
