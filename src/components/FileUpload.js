'use client';
import React, { useRef } from 'react';

const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf'];
const maxSize = 2 * 1024 * 1024; // 2 MB

export default function FileUpload({ onChange, multiple = false, accept = allowedTypes.join(','), label = "Select file...", i18n = {} }) {
  const fileInputRef = useRef(null);

  function handleFileChange(e) {
    const files = Array.from(e.target.files);
    // Validation
    for (const file of files) {
      if (!allowedTypes.includes(file.type)) {
        alert(i18n.invalidType || "Invalid file type!");
        return;
      }
      if (file.size > maxSize) {
        alert(i18n.fileTooLarge || "File too large!");
        return;
      }
    }
    onChange && onChange(multiple ? files : files[0]);
  }

  return (
    <div className="flex flex-col items-center w-full my-2">
      <button
        type="button"
        className="bg-[#81d742] text-[#111] px-4 py-2 rounded font-bold mb-1 hover:bg-[#a9ff72] transition"
        onClick={() => fileInputRef.current?.click()}
      >
        {label}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
      />
      <span className="text-xs text-gray-500 mt-1">{i18n.maxSize || "Max 2MB. Allowed: JPG, PNG, PDF"}</span>
    </div>
  );
}
