import { NextResponse } from 'next/server'
import prisma from '@/lib/prisma'
import { checkRateLimit } from '@/lib/ratelimit'
import { TextEncoder } from 'util'

export async function GET() {
  return NextResponse.json({ ok: true })
}

const CALLBACK_SECRET = process.env.PURCHASE_CALLBACK_SECRET
if (!CALLBACK_SECRET) {
  throw new Error('Missing required env var PURCHASE_CALLBACK_SECRET')
}

const ALLOWED_STATUSES = ['pending', 'confirmed', 'canceled']

function hexToBuffer(hex) {
  return Uint8Array.from(hex.match(/.{2}/g).map(b => parseInt(b, 16))).buffer
}

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
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown'
  if (!(await checkRateLimit(`purchase_cb_${ip}`, 200, 60_000))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }

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

  if (!(await verifySignature(ts, rawBody, sig))) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let body
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { token, orderId, status } = body

  const items = Array.isArray(body.products)
    ? body.products
    : [{ productCode: body.productCode, quantity: body.quantity, amount: body.amount }]

  if (!token || !orderId || !status || !ALLOWED_STATUSES.includes(status)) {
    return NextResponse.json({ error: 'Missing or invalid data' }, { status: 400 })
  }

  if (status !== 'confirmed') {
    console.info(`[purchase_callback] ignoring order ${orderId}, status=${status}`)
    return NextResponse.json({
      ok: true,
      message: `Order ${orderId} ignored (status=${status})`
    })
  }

  const link = await prisma.affiliateLink.findFirst({
    where: { token, isVisible: true },
    include: { product: { select: { merchantId: true } } }
  })
  if (!link) {
    return NextResponse.json({ error: 'Invalid or inactive token' }, { status: 404 })
  }
  const merchantId = link.product.merchantId

  const results = []

  for (const item of items) {
    const { productCode, quantity: qtyRaw, amount: amtRaw } = item
    const quantity = Number(qtyRaw) || 1
    const amount   = parseFloat(amtRaw)

    if (!productCode || isNaN(amount)) {
      results.push({ productCode, error: 'Invalid item data' })
      continue
    }

    const product = await prisma.merchantProduct.findUnique({
      where: { productCode }
    })
    if (!product || product.merchantId !== merchantId) {
      results.push({ productCode, error: 'Product not found or merchant mismatch' })
      continue
    }

    if (!product.isActive || product.totalPurchases + quantity > (product.maxSalesLimit ?? Infinity)) {
      await prisma.merchantProduct.update({
        where: { productId: product.productId },
        data: { isActive: false }
      })
      results.push({ productCode, error: 'Product inactive or limit reached' })
      continue
    }

    const existing = await prisma.affiliateUserSale.findUnique({
      where: {
        orderId_productId: {
          orderId,
          productId: product.productId
        }
      }
    })
    if (existing) {
      results.push({ productCode, error: 'Duplicate order' })
      continue
    }

    const commissionAffiliate = Number((amount * (product.commissionRate ?? 0)        / 100).toFixed(4))
    const commissionPlatform  = Number((amount * (product.platformCommissionRate ?? 0) / 100).toFixed(4))

    await prisma.affiliateUserSale.create({
      data: {
        orderId,
        userId:             link.userId,
        merchantId:         merchantId,
        productId:          product.productId,
        amount,
        quantity,
        commissionAffiliate: commissionAffiliate,
        commissionPlatform:  commissionPlatform,
        status:               'confirmed',
        convertedAt:         new Date()
      }
    })

    await prisma.merchantProduct.update({
      where: { productId: product.productId },
      data: { totalPurchases: product.totalPurchases + quantity }
    })

    results.push({ productCode, success: true, commissionAffiliate, commissionPlatform })
  }

  return NextResponse.json({ success: true, results })
}
