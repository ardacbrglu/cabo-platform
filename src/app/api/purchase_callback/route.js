// app/api/purchase_callback/route.js

import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkRateLimit } from '@/lib/ratelimit'
import { TextEncoder } from 'util'


/** Dummy GET: Collection Runner’daki “Dummy Runner” GET isteğini yakalar */
export async function GET() {
  return NextResponse.json({ ok: true })
}


/** Ortak HMAC sırrınız; .env içinde PURCHASE_CALLBACK_SECRET olarak tanımlı olmalı */
const CALLBACK_SECRET = process.env.PURCHASE_CALLBACK_SECRET
if (!CALLBACK_SECRET) {
  throw new Error('Missing required env var PURCHASE_CALLBACK_SECRET')
}

const ALLOWED_STATUSES = ['pending', 'confirmed', 'canceled']

// Hex string → ArrayBuffer çevirir
function hexToBuffer(hex) {
  return Uint8Array.from(hex.match(/.{2}/g).map(b => parseInt(b, 16))).buffer
}

// HMAC-SHA256 imzasını doğrular
async function verifySignature(ts, rawBody, signature) {
  const enc       = new TextEncoder()
  const keyData   = enc.encode(CALLBACK_SECRET)
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyData,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  )
  const msgData = enc.encode(`${ts}.${rawBody}`)
  const sigBuf  = hexToBuffer(signature)
  return crypto.subtle.verify('HMAC', cryptoKey, sigBuf, msgData)
}

export async function POST(req) {
  // 1) IP-based rate limit: max 200 istek/dk
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  if (!(await checkRateLimit(`purchase_cb_${ip}`, 200, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

  // 2) Timestamp & signature header’larını oku + raw body
  const ts      = req.headers.get('x-timestamp')
  const sig     = req.headers.get('x-signature')
  const rawBody = await req.text()
  if (!ts || !sig) {
    return NextResponse.json({ error: 'Missing signature headers' }, { status: 400 })
  }
  const tsNum = Number(ts)
  if (Number.isNaN(tsNum) || Math.abs(Date.now()/1000 - tsNum) > 300) {
    return NextResponse.json({ error: 'Stale or invalid timestamp' }, { status: 400 })
  }

  // 3) HMAC imzasını doğrula
  if (!(await verifySignature(ts, rawBody, sig))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // 4) JSON parse et
  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, order_id, status } = body

  // 5) Çoklu ürün desteği: ya body.products array’i, ya eski single-item format
  const items = Array.isArray(body.products)
    ? body.products
    : [{ product_code: body.product_code, quantity: body.quantity, amount: body.amount }]

  // 6) Temel payload validasyonu
  if (!token || !order_id || !status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Missing or invalid data' }, { status: 400 })
  }

  // 7) Sadece confirmed statüdeki siparişleri işleyelim
  if (status !== 'confirmed') {
    console.info(`[purchase_callback] ignoring order ${order_id}, status=${status}`)
    return NextResponse.json({
      ok: true,
      message: `Order ${order_id} ignored (status=${status})`
    })
  }

  // 8) Affiliate link + merchant_id bul
  const link = await prisma.affiliateLink.findFirst({
    where: { token, is_visible: true },
    include: { product: { select: { merchant_id: true } } }
  })
  if (!link) {
    return NextResponse.json({ error: 'Invalid or inactive token' }, { status: 404 })
  }
  const merchantId = link.product.merchant_id

  const results = []

  // 9) Her bir ürünü tek tek işle
  for (const item of items) {
    const { product_code, quantity: qtyRaw, amount: amtRaw } = item
    const quantity = Number(qtyRaw) || 1
    const amount   = parseFloat(amtRaw)

    if (!product_code || isNaN(amount)) {
      results.push({ product_code, error: 'Invalid item data' })
      continue
    }

    // 10) Ürünü product_code ile bul
    const product = await prisma.merchantProduct.findUnique({
      where: { product_code }
    })
    if (!product || product.merchant_id !== merchantId) {
      results.push({ product_code, error: 'Product not found or merchant mismatch' })
      continue
    }

    // 11) Aktiflik & satış limiti kontrolü
    if (!product.is_active || product.total_purchases + quantity > (product.max_sales_limit ?? Infinity)) {
      await prisma.merchantProduct.update({
        where: { product_id: product.product_id },
        data: { is_active: false }
      })
      results.push({ product_code, error: 'Product inactive or limit reached' })
      continue
    }

    // 12) Duplicate sipariş engelle (order_id+product_id)
    const existing = await prisma.affiliate_user_sales.findUnique({
      where: {
        order_id_product_id: {
          order_id,
          product_id: product.product_id
        }
      }
    })
    if (existing) {
      results.push({ product_code, error: 'Duplicate order' })
      continue
    }

    // 13) Komisyon hesapla
    const commissionAffiliate = Number((amount * (product.commission_rate ?? 0)        / 100).toFixed(4))
    const commissionPlatform  = Number((amount * (product.platform_commission_rate ?? 0) / 100).toFixed(4))

    // 14) Satışı kaydet
    await prisma.affiliate_user_sales.create({
      data: {
        order_id,
        user_id:             link.user_id,
        merchant_id:         merchantId,
        product_id:          product.product_id,
        amount,
        quantity,
        commission_affiliate: commissionAffiliate,
        commission_platform:  commissionPlatform,
        status:               'confirmed',
        converted_at:         new Date()
      }
    })

    // 15) Ürün bazında toplam satış sayısını güncelle
    await prisma.merchantProduct.update({
      where: { product_id: product.product_id },
      data: { total_purchases: product.total_purchases + quantity }
    })

    results.push({ product_code, success: true, commissionAffiliate, commissionPlatform })
  }

  // 16) Sonucu dön
  return NextResponse.json({ success: true, results })
}
