'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { PlusCircle, LogOut, CheckCircle, Eye, EyeOff, Copy, Ban } from 'lucide-react';

const PLACEHOLDER = "https://placehold.co/128x128?text=Product";
function handleImgError(e) {
  e.target.onerror = null;
  e.target.src = PLACEHOLDER;
}

function getQuotaStatus(product) {
  if (!product.is_active) return "inactive";
  if (product.total_purchases >= product.max_sales_limit) return "quota";
  return null;
}

export default function MerchantDashboardPage() {
  const pathname = usePathname();
  const { user, setUser } = useUser();
  const router = useRouter();

  const [products, setProducts] = useState([]);
  const [formVisible, setFormVisible] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    image_url: '',
    price: '',
    commission_rate: '',
    merchant_url: '',
    max_sales_limit: ''
  });
  const [message, setMessage] = useState('');
  const [minCommission, setMinCommission] = useState(5);
  const [showCode, setShowCode] = useState({});
  const [copyMsg, setCopyMsg] = useState({});
  const [editingProductId, setEditingProductId] = useState(null);
  const [editValues, setEditValues] = useState({ commission_rate: '', max_sales_limit: '' });
  const [loading, setLoading] = useState(false);

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/merchant_dashboard', {
        credentials: 'include',
      });
      if (!res.ok) {
        setProducts([]);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setProducts(data.products);
        setMinCommission(data.minCommission || 5);
      } else {
        setProducts([]);
      }
    } catch (error) {
      setProducts([]);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleLogout = async () => {
    document.cookie = "cabo_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setUser(null);
    router.push("/");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/merchant_dashboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form),
      });
      if (res.ok) {
        setFormVisible(false);
        setForm({
          name: '',
          description: '',
          image_url: '',
          price: '',
          commission_rate: '',
          merchant_url: '',
          max_sales_limit: ''
        });
        fetchProducts();
        setMessage('✅ Your product is sent for review. To complete activation, please check the “How to Integrate” page.');
        setTimeout(() => setMessage(''), 5000);
      } else {
        const data = await res.json();
        setMessage(`❌ ${data.error || 'Failed to add product.'}`);
      }
    } catch (err) {
      setMessage('❌ Server error. Please try again later.');
    }
    setLoading(false);
  };

  const handleDeactivate = async (product_id, action) => {
    setLoading(true);
    try {
      const res = await fetch('/api/merchant_dashboard', {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product_id, action }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to update product.');
      } else {
        fetchProducts();
      }
    } catch (error) {
      alert('Server error during product update.');
    }
    setLoading(false);
  };

  const remainingQuota = (limit, sold) => {
    const remaining = Number(limit) - Number(sold);
    return remaining < 0 ? 0 : remaining;
  };

  const toggleShowCode = (product_id) => {
    setShowCode(prev => ({ ...prev, [product_id]: !prev[product_id] }));
  };

  const copyProductCode = async (product_id, code) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopyMsg(prev => ({ ...prev, [product_id]: 'Copied!' }));
      setTimeout(() => setCopyMsg(prev => ({ ...prev, [product_id]: '' })), 1200);
    } catch {
      alert('Failed to copy product code.');
    }
  };

  const startEditing = (product) => {
    setEditingProductId(product.product_id);
    setEditValues({
      commission_rate: product.commission_rate,
      max_sales_limit: product.max_sales_limit
    });
  };

  const handleEditChange = (field, value) => {
    setEditValues(prev => ({ ...prev, [field]: value }));
  };

  const saveEdits = async () => {
    if (editValues.commission_rate < minCommission) {
      alert(`Commission rate must be at least ${minCommission}%`);
      return;
    }
    if (!Number.isInteger(Number(editValues.max_sales_limit)) || Number(editValues.max_sales_limit) < 0) {
      alert('Max sales limit must be a non-negative integer');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/merchant_dashboard', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_id: editingProductId,
          commission_rate: Number(editValues.commission_rate),
          max_sales_limit: Number(editValues.max_sales_limit)
        }),
      });
      if (res.ok) {
        setEditingProductId(null);
        fetchProducts();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to update product.');
      }
    } catch (err) {
      alert('Server error during product update.');
    }
    setLoading(false);
  };

  const cancelEdits = () => {
    setEditingProductId(null);
    setEditValues({ commission_rate: '', max_sales_limit: '' });
  };

  // STYLED DASHBOARD 
  return (
    <div className="min-h-screen flex flex-col bg-[#101010] text-white font-sans tracking-tight">
      {/* NAVBAR */}
      <header className="flex justify-between items-center px-10 py-6 bg-[#111] border-b border-[#1f1f1f] shadow-sm">
        <h1
          className="text-4xl md:text-5xl font-extrabold tracking-tight select-none"
          style={{ color: "#d1ffd0", letterSpacing: "-0.02em", textShadow: "0 2px 12px rgba(129,215,66,0.08)" }}
        >
          Cabo
        </h1>
        <nav className="flex gap-8 items-center text-sm font-medium">
          <Link
            href="/merchant/dashboard"
            className={`transition hover:text-[#81d742] hover:scale-[1.015] ${pathname === '/merchant/dashboard' ? 'text-[#81d742] font-semibold' : 'text-gray-200'}`}
          >
            Manage Products
          </Link>
          <Link
            href="/merchant/merchant_payments"
            className={`transition hover:text-[#81d742] hover:scale-[1.015] ${pathname === '/merchant/payments' ? 'text-[#81d742] font-semibold' : 'text-gray-200'}`}
          >
            Payments
          </Link>
          <Link
            href="/merchant/merchant_info"
            className={`transition hover:text-[#81d742] hover:scale-[1.015] ${pathname === '/merchant/info' ? 'text-[#81d742] font-semibold' : 'text-gray-200'}`}
          >
            How to Integrate
          </Link>
          <Link
            href="/merchant/merchant_support"
            className={`transition hover:text-[#81d742] hover:scale-[1.015] ${pathname === '/merchant/support' ? 'text-[#81d742] font-semibold' : 'text-gray-200'}`}
          >
            Support
          </Link>
          <button onClick={handleLogout} className="text-red-500 hover:text-red-400 transition ml-4" title="Logout">
            <LogOut size={20} />
          </button>
        </nav>
      </header>

      {/* MAIN */}
      <main className="flex-grow px-4 md:px-8 py-8">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center mb-8 gap-4">
          <h1 className="text-3xl font-bold text-[#d1ffd0]">Manage Products</h1>
          <button
            onClick={() => setFormVisible(!formVisible)}
            className="flex items-center gap-2 bg-[#81d742] text-[#101010] px-5 py-2 rounded hover:bg-[#aaff6c] transition font-semibold text-base shadow"
          >
            <PlusCircle size={19} /> Add New Product
          </button>
        </div>

        {message && (
          <div className="mb-6 flex items-center gap-2 text-sm font-semibold text-green-400 bg-green-900/20 border border-green-800 px-4 py-3 rounded-md">
            <CheckCircle size={18} /> {message}
          </div>
        )}

        {formVisible && (
          <form onSubmit={handleSubmit} className="bg-[#171b17] border border-[#2a2a2a] p-6 rounded-2xl mb-10 space-y-4 shadow-xl max-w-2xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <input type="text" placeholder="Title" className="input" required onChange={e => setForm({ ...form, name: e.target.value })} />
              <input type="text" placeholder="Product URL" className="input" required onChange={e => setForm({ ...form, merchant_url: e.target.value })} />
              <input type="text" placeholder="Image URL" className="input" required onChange={e => setForm({ ...form, image_url: e.target.value })} />
              <input type="number" placeholder="Price (USD)" className="input" required step="0.01" onChange={e => setForm({ ...form, price: e.target.value })} />
              <input type="number" placeholder={`Commission Rate (%), min ${minCommission}`} className="input" required step="0.1" min={minCommission} onChange={e => setForm({ ...form, commission_rate: e.target.value })} />
              <input type="number" placeholder="Max Sales Limit" className="input" required onChange={e => setForm({ ...form, max_sales_limit: e.target.value })} />
            </div>
            <textarea placeholder="Description" className="input w-full" rows={3} onChange={e => setForm({ ...form, description: e.target.value })}></textarea>
            <p className="text-xs text-gray-400 font-mono -mt-2">💡 Higher commission rates attract more affiliates to promote your product.</p>
            <button type="submit" disabled={loading} className="bg-[#81d742] text-[#101010] font-semibold py-2 px-6 rounded hover:bg-[#aaff6c] mt-3">
              {loading ? 'Adding...' : 'Submit for Review'}
            </button>
          </form>
        )}

        {/* Product Cards */}
        <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 xl:grid-cols-3">
          {products.map((p) => {
            const status = getQuotaStatus(p);
            return (
              <div
                key={p.product_id}
                className={`relative bg-[#181818] border border-[#232323] rounded-2xl p-7 flex flex-col shadow-lg hover:shadow-2xl transition-all duration-300 min-h-[490px] max-w-lg mx-auto group
                  ${status ? 'opacity-60 grayscale' : ''}`}
              >
                {/* Status BADGES */}
                {status === "inactive" && (
                  <span className="absolute left-5 top-5 bg-red-700/90 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                    <Ban size={13} /> Inactive
                  </span>
                )}
                {status === "quota" && (
                  <span className="absolute left-5 top-5 bg-yellow-600/90 text-white px-3 py-1 rounded-full text-xs flex items-center gap-1">
                    <Ban size={13} /> Quota Reached
                  </span>
                )}
                {/* Product IMAGE */}
                <img
                  src={p.image_url || PLACEHOLDER}
                  onError={handleImgError}
                  alt={p.name}
                  className="rounded-xl mb-4 h-44 w-full object-cover border border-[#202720]"
                  style={{ background: "#23262a" }}
                />
                <h3 className="text-2xl font-extrabold text-[#d1ffd0] mb-1 truncate">{p.name}</h3>
                <p className="text-sm text-gray-400 mb-3 line-clamp-2">{p.description}</p>

                <div className="flex flex-wrap justify-between text-base mb-2 text-gray-200 font-mono gap-y-1">
                  <span><span className="text-gray-500">Price</span>: <span className="font-bold">${Number(p.price).toFixed(2)}</span></span>
                  <span><span className="text-gray-500">Commission</span>: <span className="font-bold text-green-300">{Number(p.commission_rate).toFixed(2)}%</span></span>
                </div>
                <div className="flex flex-wrap justify-between text-xs mb-2 text-gray-400 gap-y-1">
                  <span>Clicks: <b>{p.total_clicks}</b></span>
                  <span>Sales: <b>{p.total_purchases}</b></span>
                  <span>Quota Left: <b>{remainingQuota(p.max_sales_limit, p.total_purchases)}</b></span>
                </div>
                <div className="flex flex-wrap justify-between text-xs mb-2 text-gray-400 gap-y-1">
                  <span>Affiliates: <b>{p.link_count}</b></span>
                  <span>Product ID: {p.product_id}</span>
                </div>
                {/* Product Code */}
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-gray-400">Product Code:</span>
                  {showCode[p.product_id] ? (
                    <>
                      <span className="font-mono text-green-300 text-xs select-all">{p.product_code}</span>
                      <button
                        type="button"
                        onClick={() => copyProductCode(p.product_id, p.product_code)}
                        className="ml-1 text-[#81d742] hover:text-green-200 transition"
                        title="Copy Product Code"
                      >
                        <Copy size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleShowCode(p.product_id)}
                        className="text-gray-400 hover:text-gray-200 transition"
                        title="Hide"
                      >
                        <EyeOff size={15} />
                      </button>
                      {copyMsg[p.product_id] && <span className="ml-2 text-green-400 font-mono text-xs">{copyMsg[p.product_id]}</span>}
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleShowCode(p.product_id)}
                      className="flex items-center gap-1 text-gray-400 hover:text-[#81d742] font-mono text-xs bg-[#161616] rounded px-2 py-1 ml-1"
                      title="Show Product Code"
                    >
                      <Eye size={14} /> Show
                    </button>
                  )}
                </div>
                <div className={`mt-4 text-xs font-semibold ${p.activated_by_admin ? 'text-green-500' : 'text-yellow-400'}`}>
                  {p.activated_by_admin ? 'Approved by Admin' : 'Waiting Approval'}
                </div>
                {/* Edit & Activate/Deactivate */}
                <div className="flex flex-col gap-2 mt-auto pt-4">
                  {editingProductId === p.product_id ? (
                    <div className="flex flex-col gap-2">
                          <div className="mb-3 bg-yellow-900/70 border border-yellow-600 text-yellow-100 px-3 py-2 rounded text-xs font-mono font-bold">
                            ⚠️ Any changes made will require admin approval before your product becomes available again.
                          </div>
                      <div className="flex gap-3 items-center">
                        <label className="text-xs text-[#d1ffd0] font-mono mr-1 w-24">Commission (%)</label>
                        <input
                          type="number"
                          step="0.1"
                          min={minCommission}
                          max={99}
                          value={editValues.commission_rate}
                          onChange={e => handleEditChange('commission_rate', e.target.value)}
                          className="rounded bg-[#232323] text-green-300 w-24 px-2 py-1 text-xs font-mono"
                          placeholder="Commission Rate"
                        />
                        <span className="ml-2 text-xs text-gray-400">(min: {minCommission})</span>
                      </div>
                      <div className="flex gap-3 items-center">
                        <label className="text-xs text-[#d1ffd0] font-mono mr-1 w-24">Max Sales</label>
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={editValues.max_sales_limit}
                          onChange={e => handleEditChange('max_sales_limit', e.target.value)}
                          className="rounded bg-[#232323] text-blue-300 w-28 px-2 py-1 text-xs font-mono"
                          placeholder="Max Sales"
                        />
                        <span className="ml-2 text-xs text-gray-400">(sold: {p.total_purchases})</span>
                      </div>
                      <div className="flex gap-2 mt-2">
                        <button
                          onClick={saveEdits}
                          disabled={loading}
                          className="bg-[#81d742] px-3 py-1 rounded font-semibold text-[#0b0b0b] hover:bg-[#aaff6c] text-xs"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdits}
                          disabled={loading}
                          className="bg-[#a94a4a] px-3 py-1 rounded font-semibold hover:bg-[#ff6a6a] text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() => startEditing(p)}
                        className="bg-[#2f4f2f] hover:bg-[#3f6f3f] text-white py-2 rounded text-sm flex-1"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeactivate(p.product_id, p.is_active ? 'deactivate' : 'activate')}
                        className={`${p.is_active ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'} text-white py-2 rounded text-sm flex-1`}
                      >
                        {p.is_active ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="text-center py-5 bg-[#111] text-gray-500 text-xs border-t border-[#1f1f1f] mt-auto">
        &copy; 2025 Cabo Affiliate | Built by Arda Cabaroğlu
      </footer>
    </div>
  );
}
