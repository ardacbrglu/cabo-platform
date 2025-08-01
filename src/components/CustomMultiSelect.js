import { useRef } from 'react';

export default function CustomMultiSelect({ options, selected, setSelected, label }) {
  const listRef = useRef();

  function handleSelect(id) {
    setSelected([id]);
  }

  return (
    <div className="relative w-full">
      {label && (
        <span className="block mb-1 font-bold text-[#81d742]">{label}</span>
      )}
      <div className="bg-[#222] border border-[#444] rounded p-2">
        <div
          className="cursor-pointer select-none text-white bg-[#333] rounded px-2 py-1"
          tabIndex={0}
          onClick={() => listRef.current?.focus()}
        >
          {options.find(o => o.value === selected[0])?.label || "Select Product"}
        </div>
        <ul
          ref={listRef}
          tabIndex={-1}
          className="mt-2 rounded bg-[#222] shadow-lg border border-[#444] overflow-y-auto"
          style={{
            maxHeight: "420px", // 10 ürün satırı (10 x 42px)
            minHeight: "42px",  // En az bir ürün için
            width: "100%",
            paddingRight: 2,
          }}
        >
          {options.map(option => (
            <li
              key={option.value}
              onClick={() => handleSelect(option.value)}
              className={`px-2 py-2 cursor-pointer rounded mb-1
                ${selected[0] === option.value
                  ? "bg-[#333] text-[#d1ffd0] font-semibold"
                  : "hover:bg-[#252525] text-white"
                }`}
              style={{
                userSelect: 'none',
                outline: 'none',
                minHeight: 38, // Her ürün satırı (mobilde de güzel durur)
                display: 'flex',
                alignItems: 'center',
                fontSize: 16,
              }}
            >
              {option.label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
