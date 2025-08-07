import { useState, useRef, useEffect } from 'react';

export default function CustomSelect({ options, value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative w-full" ref={ref}>
      {label && (
        <span className="block mb-1 font-bold text-[#81d742]">{label}</span>
      )}
      <button
        type="button"
        className="w-full flex items-center justify-between bg-[#222] border border-[#444] rounded px-3 py-2 text-white focus:outline-none"
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          {options.find((opt) => opt.value === value)?.label ||
            <span className="text-gray-400">Select</span>}
        </span>
        <svg
          className={`w-4 h-4 ml-2 transform ${open ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <ul className="absolute left-0 right-0 z-20 mt-2 bg-[#191919] border border-[#333] rounded shadow-xl max-h-60 overflow-y-auto animate-fade-in">
          {options.map((opt) => (
            <li
              key={opt.value}
              className={`px-4 py-2 cursor-pointer text-base rounded transition
                ${value === opt.value ? "bg-[#333] text-[#d1ffd0] font-semibold" : "hover:bg-[#232323] text-white"}
              `}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </li>
          ))}
        </ul>
      )}
      <style jsx>{`
        .animate-fade-in {
          animation: fadeIn .15s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px);}
          to   { opacity: 1; transform: none;}
        }
      `}</style>
    </div>
  );
}
