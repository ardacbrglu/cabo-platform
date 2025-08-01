// app/api/ref/[token]/route.js

import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { z } from 'zod';

// 1) params şeması: token en az 16 karakter olsun
const paramsSchema = z.object({
  token: z.string().min(16)
});

// 2) IP tespiti
function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp;
  return '127.0.0.1';
}

export async function GET(request, { params }) {
  try {
    // 3) params.token'ı await ile aç ve doğrula
    const { token } = await params;
    paramsSchema.parse({ token });

    const now = new Date();

    // 4) Link + ürün kontrolü ( yalnızca visible ve henüz expire olmamış )
    const link = await prisma.affiliateLink.findFirst({
      where: {
        token,
        is_visible: true,
        expires_at: { gt: now }
      },
      select: {
        link_id: true,
        product_id: true,
        product: {
          select: { merchant_url: true, is_active: true }
        }
      }
    });
    if (!link || !link.product.is_active) {
      return NextResponse.json({ error: 'Link not found or inactive' }, { status: 404 });
    }

    // 5) IP & UA
    const ip        = getClientIp(request);
    const userAgent = request.headers.get('user-agent')?.slice(0, 512) || 'unknown';

    // 6) Duplicate click kontrolü (son 30dk)
    const cutoff = new Date(Date.now() - 30 * 60 * 1000);
    const recentClick = await prisma.click.findFirst({
      where: {
        link_id:   link.link_id,
        ip_address: ip,
        user_agent: userAgent,
        clicked_at: { gte: cutoff }
      }
    });

    // 7) Yeni tıklamayı ve toplam sayacı atomik olarak ekle
    if (!recentClick) {
      await prisma.$transaction([
        prisma.click.create({
          data: {
            link_id:    link.link_id,
            ip_address: ip,
            user_agent: userAgent,
            clicked_at: new Date()
          }
        }),
        prisma.merchantProduct.update({
          where: { product_id: link.product_id },
          data: { total_clicks: { increment: 1 } }
        })
      ]);
    }

    // 8) URL doğrula ve redirect paramını ekle
    let redirectUrl;
    try {
      redirectUrl = new URL(link.product.merchant_url);
    } catch {
      return NextResponse.json({ error: 'Invalid merchant URL' }, { status: 400 });
    }
    if (!['http:', 'https:'].includes(redirectUrl.protocol)) {
      return NextResponse.json({ error: 'Invalid merchant URL' }, { status: 400 });
    }
    redirectUrl.searchParams.append('token', token);

    // 9) Redirect
    return NextResponse.redirect(redirectUrl.toString(), 302);

  } catch (err) {
    console.error('[ref] GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
