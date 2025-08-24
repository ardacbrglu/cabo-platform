"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

export default function CustomSelect({
  options = [],           // [{ value, label }]
  value,
  onChange,
  label,
  placeholder = "Select",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const wrapRef = useRef(null);
  const listRef = useRef(null);
  const buttonRef = useRef(null);
  const uid = useId();

  const selectedIndex = useMemo(
    () => options.findIndex((o) => o.value === value),
    [options, value]
  );
  const selectedOption = selectedIndex >= 0 ? options[selectedIndex] : null;

  // Dış tık ile kapat
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // ESC / TAB ile kapat, ok tuşlarıyla gezin
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" || e.key === "Tab") {
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (!options.length) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = i < 0 ? Math.max(0, selectedIndex) : i + 1;
          return Math.min(next, options.length - 1);
        });
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => {
          const next = i < 0 ? Math.max(0, selectedIndex) : i - 1;
          return Math.max(next, 0);
        });
      }
      if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      }
      if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(options.length - 1);
      }
      if (e.key === "Enter" || e.key === " ") {
        if (activeIndex >= 0 && activeIndex < options.length) {
          e.preventDefault();
          const opt = options[activeIndex];
          onChange?.(opt.value);
          setOpen(false);
          buttonRef.current?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, options, selectedIndex, activeIndex, onChange]);

  // Açıldığında aktif öğe = seçili (ya da 0)
  useEffect(() => {
    if (open) {
      setActiveIndex(selectedIndex >= 0 ? selectedIndex : (options.length ? 0 : -1));
      // küçük gecikme ile görünümde merkeze getir
      requestAnimationFrame(() => {
        const el = listRef.current?.querySelector('[data-active="true"]');
        el?.scrollIntoView?.({ block: "nearest" });
      });
    }
  }, [open, selectedIndex, options.length]);

  const listboxId = `listbox-${uid}`;
  const activeId = activeIndex >= 0 ? `option-${uid}-${activeIndex}` : undefined;

  return (
    <div className={`relative w-full ${className}`} ref={wrapRef}>
      {label && (
        <label
          htmlFor={`select-btn-${uid}`}
          className="block mb-1 font-bold text-[#81d742]"
        >
          {label}
        </label>
      )}

      <button
        id={`select-btn-${uid}`}
        type="button"
        ref={buttonRef}
        disabled={disabled}
        className={`w-full flex items-center justify-between bg-[#222] border border-[#444] rounded px-3 py-2 text-white focus:outline-none ${
          disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
        }`}
        onClick={() => !disabled && setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-disabled={disabled || undefined}
      >
        <span>
          {selectedOption ? (
            selectedOption.label
          ) : (
            <span className="text-gray-400">{placeholder}</span>
          )}
        </span>
        <svg
          className={`w-4 h-4 ml-2 transform transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <ul
          id={listboxId}
          ref={listRef}
          role="listbox"
          aria-activedescendant={activeId}
          className="absolute left-0 right-0 z-20 mt-2 bg-[#191919] border border-[#333] rounded shadow-xl max-h-60 overflow-y-auto animate-fade-in"
        >
          {options.map((opt, i) => {
            const selected = value === opt.value;
            const active = i === activeIndex;
            return (
              <li
                id={`option-${uid}-${i}`}
                key={opt.value}
                role="option"
                aria-selected={selected}
                data-active={active ? "true" : undefined}
                tabIndex={-1}
                className={`px-4 py-2 cursor-pointer text-base rounded transition
                  ${
                    selected
                      ? "bg-[#333] text-[#d1ffd0] font-semibold"
                      : active
                      ? "bg-[#232323] text-white"
                      : "hover:bg-[#232323] text-white"
                  }
                `}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                  buttonRef.current?.focus();
                }}
              >
                {opt.label}
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-4 py-2 text-sm text-gray-400 select-none">—</li>
          )}
        </ul>
      )}

      <style jsx>{`
        .animate-fade-in {
          animation: fadeIn .15s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-8px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
