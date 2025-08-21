export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SECURITY NOTES
 * - Tekil kaynak: authOptions merkezi olarak /src/lib/authOptions.js dosyasında tutulur.
 * - Bu route yalnızca NextAuth handler’ını yayımlar. Sağlayıcı, RBAC, callback ve
 *   diğer kuralların tamamı authOptions içinde yönetilir.
 */
import NextAuth from "next-auth";
import { authOptions } from "@/lib/authOptions";

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };
