"use client";
import { useEffect, useMemo, useRef, useState } from "react";

/**
 * CustomMultiSelect (tek seçimli görünür ama API tek elemanlı dizi isterse setSelected([id]) şeklinde)
 * - Klavye: ↑ ↓ Enter Escape
 * - 400+ öge için sanal liste gerekmiyorsa yeterli
 */
export default function CustomMultiSelect({ options = [], selected = [], setSelected, label }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const boxRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (!boxRef.current) return;
      if (!boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(id) {
    setSelected([id]);
    setOpen(false);
  }

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    if (!k) return options;
    return options.filter((o) => String(o.label || "").toLowerCase().includes(k));
  }, [q, options]);

  const current = options.find((o) => o.value === selected[0]);

  return (
    <div className="relative w-full" ref={boxRef}>
      {label ? <span className="block mb-1 font-bold text-[#81d742]">{label}</span> : null}

      <button
        type="button"
        className="w-full bg-[#222] border border-[#444] rounded px-3 py-2 text-left text-white flex items-center justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{current?.label || <span className="text-gray-400">—</span>}</span>
        <svg className={`w-4 h-4 ml-2 ${open ? "rotate-180" : ""}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-30 mt-2 bg-[#191919] border border-[#333] rounded-xl shadow-xl overflow-hidden">
          <input
            autoFocus
            placeholder="Search…"
            className="w-full px-3 py-2 bg-[#161616] text-white border-b border-[#2a2a2a] outline-none"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && filtered.length) choose(filtered[0].value);
            }}
          />
          <ul
            ref={listRef}
            className="max-h-80 overflow-y-auto p-1"
            style={{ scrollBehavior: "smooth" }}
          >
            {filtered.map((opt) => (
              <li
                key={opt.value}
                onClick={() => choose(opt.value)}
                className={`px-3 py-2 rounded cursor-pointer text-white mb-0.5 ${
                  selected[0] === opt.value
                    ? "bg-[#2c2c2c] text-[#d1ffd0] font-semibold"
                    : "hover:bg-[#232323]"
                }`}
              >
                {opt.label}
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-gray-400">No results</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
