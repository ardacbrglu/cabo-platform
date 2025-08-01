import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { cookies } from 'next/headers';

const JWT_SECRET = process.env.JWT_SECRET || "SUPER_SECRET_KEY";

export async function GET() {
  try {
    const cookieStore = await cookies();
    const tokenValue = cookieStore.get('cabo_token')?.value;

    if (!tokenValue) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let token;
    try {
      token = jwt.verify(tokenValue, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!token || token.role !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const config = await prisma.platform_config.findUnique({
      where: { key_name: 'min_commission' }
    });
    const minCommission = config ? parseFloat(config.value) : 5;

    const products = await prisma.merchantProduct.findMany({
      where: { merchant_id: token.user_id },
      orderBy: { created_at: 'desc' },
      select: {
        product_id: true,
        name: true,
        description: true,
        image_url: true,
        merchant_url: true,
        commission_rate: true,
        is_active: true,
        total_clicks: true,
        total_purchases: true,
        max_sales_limit: true,
        created_at: true,
        price: true,
        activated_by_admin: true,
        product_code: true,
        affiliate_links: {
          select: { link_id: true },
          where: { is_visible: true }
        }
      }
    });

    const formatted = products.map(p => ({
      ...p,
      link_count: p.affiliate_links.length,
      remaining_quota: Math.max(0, p.max_sales_limit - p.total_purchases)
    }));

    return NextResponse.json({ success: true, products: formatted, minCommission });
  } catch (err) {
    console.error('Dashboard Fetch Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const cookieStore = await cookies();
    const tokenValue = cookieStore.get('cabo_token')?.value;

    if (!tokenValue) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let token;
    try {
      token = jwt.verify(tokenValue, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!token || token.role !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      name,
      description,
      image_url,
      price,
      commission_rate,
      merchant_url,
      max_sales_limit
    } = body;

    if (!name || !image_url || !merchant_url || !price || !commission_rate || !max_sales_limit) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const config = await prisma.platform_config.findUnique({
      where: { key_name: 'min_commission' }
    });
    const minCommission = config ? parseFloat(config.value) : 5;

    if (parseFloat(commission_rate) < minCommission) {
      return NextResponse.json({ error: `Commission rate must be at least ${minCommission}%` }, { status: 400 });
    }

    const product_code = crypto.randomBytes(16).toString('hex');

    const newProduct = await prisma.merchantProduct.create({
      data: {
        merchant_id: token.user_id,
        name,
        description: description || '',
        image_url,
        price: parseFloat(price),
        commission_rate: parseFloat(commission_rate),
        merchant_url,
        max_sales_limit: parseInt(max_sales_limit),
        product_code
      }
    });

    return NextResponse.json({ success: true, product_id: newProduct.product_id });
  } catch (err) {
    console.error('Product Create Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PATCH(req) {
  try {
    const cookieStore = await cookies();
    const tokenValue = cookieStore.get('cabo_token')?.value;

    if (!tokenValue) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let token;
    try {
      token = jwt.verify(tokenValue, JWT_SECRET);
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    if (!token || token.role !== 'merchant') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { product_id, commission_rate, max_sales_limit, action } = body;

    if (!product_id) {
      return NextResponse.json({ error: 'Missing product_id' }, { status: 400 });
    }

    const config = await prisma.platform_config.findUnique({
      where: { key_name: 'min_commission' }
    });
    const minCommission = config ? parseFloat(config.value) : 5;

    const dataToUpdate = {};

    let editTriggered = false;
    if (commission_rate !== undefined) {
      if (typeof commission_rate !== 'number') {
        return NextResponse.json({ error: 'commission_rate must be a number' }, { status: 400 });
      }
      if (commission_rate < minCommission) {
        return NextResponse.json({ error: `Commission rate must be at least ${minCommission}%` }, { status: 400 });
      }
      dataToUpdate.commission_rate = commission_rate;
      editTriggered = true;
    }

    if (max_sales_limit !== undefined) {
      if (!Number.isInteger(max_sales_limit) || max_sales_limit < 0) {
        return NextResponse.json({ error: 'max_sales_limit must be a non-negative integer' }, { status: 400 });
      }
      dataToUpdate.max_sales_limit = max_sales_limit;
      editTriggered = true;
    }

    // EDIT SONRASI admin approval’a düşür!
    if (editTriggered) {
      dataToUpdate.activated_by_admin = false;
      dataToUpdate.is_active = false;
    }

    if (action === 'deactivate') {
      dataToUpdate.is_active = false;
    } else if (action === 'activate') {
      // Not: activate request’iyle ürünü aktif et ama activated_by_admin true olmadıkça marketplace'te gösterme!
      dataToUpdate.is_active = true;
    }

    // Ürünün merchant'a aitliği kontrolü
    const product = await prisma.merchantProduct.findUnique({
      where: { product_id: Number(product_id) }
    });

    if (!product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 });
    }

    if (product.merchant_id !== token.user_id) {
      return NextResponse.json({ error: 'Unauthorized to update this product' }, { status: 403 });
    }

    const updated = await prisma.merchantProduct.update({
      where: { product_id: Number(product_id) },
      data: dataToUpdate,
    });

    return NextResponse.json({ success: true, updatedProduct: updated });
  } catch (err) {
    console.error('Product Patch Error:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
