// app/notifications/page.js
"use client";

/**
 * Notifications — mobile safe
 * - Satır = CSS Grid: [checkbox][dot][message(minmax(0,1fr))][actions]
 * - Mesaj: tek satır, ellipsis, mobilde küçük font
 * - Satır ve container: min-w-0 + overflow-x-hidden → yatay kayma yok
 * - Header butonları dar; aksiyonlar ikon-only
 */

import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import Layout from "@/components/Layout";
import { useNotifications } from "@/hooks/useNotifications";
import { useTranslation } from "@/hooks/useTranslation";
import { Bell, Trash2, Eye, X } from "lucide-react";

const NOTIFS_PER_PAGE = 8;

function Dot() {
  return (
    <span
      className="inline-block rounded-full shrink-0"
      style={{
        width: 10,
        height: 10,
        minWidth: 10,
        minHeight: 10,
        background: "#7a7a7a",
        boxShadow: "0 0 0 1.25px #101010",
      }}
      aria-hidden="true"
    />
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const {
    notifications,
    markSelectedAsRead,
    markOneAsRead,
    deleteNotifications,
    deleteOne,
    unreadCount,
  } = useNotifications(true);

  const tt = (k, fb) => {
    const v = t(k);
    return v === k ? fb : v;
  };

  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);
  const [viewer, setViewer] = useState(null);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((notifications?.length || 0) / NOTIFS_PER_PAGE)),
    [notifications]
  );

  const pageNotifs = useMemo(() => {
    if (!Array.isArray(notifications)) return [];
    const start = (page - 1) * NOTIFS_PER_PAGE;
    return notifications.slice(start, start + NOTIFS_PER_PAGE);
  }, [notifications, page]);

  const currentPageIds = useMemo(() => pageNotifs.map((n) => n.id), [pageNotifs]);
  const allSelected =
    currentPageIds.length > 0 && currentPageIds.every((id) => selected.includes(id));

  const toggleSelect = (id) =>
    setSelected((sel) => (sel.includes(id) ? sel.filter((i) => i !== id) : [...sel, id]));

  const handleSelectAll = () => {
    if (!currentPageIds.length) return;
    setSelected((sel) =>
      allSelected
        ? sel.filter((id) => !currentPageIds.includes(id))
        : Array.from(new Set([...sel, ...currentPageIds]))
    );
  };

  const handleMarkAsRead = async () => {
    if (!selected.length) return;
    await markSelectedAsRead(selected);
    setSelected([]);
  };

  const handleDeleteSelected = async () => {
    if (!selected.length) return;
    await deleteNotifications(selected);
    setSelected([]);
  };

  const openViewer = useCallback(
    async (n) => {
      if (!n.read) await markOneAsRead(n.id);
      setViewer(n);
    },
    [markOneAsRead]
  );
  const closeViewer = useCallback(() => setViewer(null), []);

  // iOS-safe scroll lock (modal)
  const scrollRestore = useRef({ y: 0, prev: "" });
  useEffect(() => {
    if (!viewer) return;
    const body = document.body;
    scrollRestore.current.y = window.scrollY || 0;
    scrollRestore.current.prev = body.style.cssText;
    body.style.position = "fixed";
    body.style.top = `-${scrollRestore.current.y}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overflow = "hidden";
    const onKey = (e) => e.key === "Escape" && closeViewer();
    window.addEventListener("keydown", onKey);
    return () => {
      body.style.cssText = scrollRestore.current.prev;
      window.scrollTo(0, scrollRestore.current.y);
      window.removeEventListener("keydown", onKey);
    };
  }, [viewer, closeViewer]);

  return (
    <Layout>
      {/* Global güvenlik: yatay scroll kapalı + hamburger panel genişliği 100% */}
      <style jsx global>{`
        html, body { overflow-x: hidden !important; }
        #cabo-toplayer-panel { width: 100% !important; left: 0 !important; right: 0 !important; }
        #notif-page-root, #notif-page-root * { min-width: 0; box-sizing: border-box; }
      `}</style>

      <main id="notif-page-root" className="w-full flex flex-col items-center py-8 overflow-x-hidden">
        <div className="w-full max-w-[640px] mx-auto px-3 sm:px-4">
          <section className="bg-[#181818] rounded-2xl shadow border border-[#222328]/70 p-4 sm:p-6 w-full overflow-x-hidden">
            {/* Header */}
            <div className="flex items-center justify-between gap-2 mb-4 w-full">
              <div className="flex items-center gap-2 min-w-0 max-w-full">
                <span className="relative shrink-0">
                  <Bell size={22} className="text-white" />
                  {unreadCount > 0 && (
                    <span
                      className="absolute -top-1 right-0 translate-x-1/4 w-2.5 h-2.5 bg-[#ff5555] border-2 border-[#181818] rounded-full"
                      aria-hidden="true"
                    />
                  )}
                </span>
                <h2 className="text-lg sm:text-2xl font-black font-mono text-white truncate">
                  {t("notifications")}
                </h2>
              </div>

              {/* Compact header actions */}
              <div className="flex gap-1.5 sm:gap-2 flex-wrap justify-end shrink-0">
                <button
                  onClick={handleMarkAsRead}
                  className="px-2 py-1.5 sm:px-3 rounded-md bg-[#2a2a2a] text-gray-100 font-mono font-bold text-[12px] sm:text-sm disabled:opacity-50 hover:bg-[#333]"
                  disabled={!selected.length}
                  title={tt("markSelectedAsRead", "Mark selected as read")}
                >
                  <span className="sm:hidden">Okundu</span>
                  <span className="hidden sm:inline">{tt("markSelectedAsRead", "Okundu yap")}</span>
                </button>
                <button
                  onClick={handleDeleteSelected}
                  className="px-2 py-1.5 sm:px-3 rounded-md bg-[#3a1717] text-white font-mono font-bold text-[12px] sm:text-sm disabled:opacity-50 hover:bg-[#4a1d1d]"
                  disabled={!selected.length}
                  title={t("deleteSelected")}
                >
                  <span className="sm:hidden">Sil</span>
                  <span className="hidden sm:inline">{t("deleteSelected")}</span>
                </button>
              </div>
            </div>

            {/* Select all */}
            <div className="flex items-center mb-3">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={handleSelectAll}
                className="accent-[#81d742] w-5 h-5 mr-2 shrink-0"
                id="select-all"
              />
              <label htmlFor="select-all" className="text-white text-sm font-mono">
                {t("selectAll")}
              </label>
            </div>

            {/* List */}
            <div className="flex flex-col gap-2 pb-1 min-h-[360px] overflow-x-hidden">
              {pageNotifs.length === 0 ? (
                <div className="text-gray-400 font-mono text-sm py-10 text-center">
                  {t("nonotifications")}
                </div>
              ) : (
                pageNotifs.map((n) => {
                  const isSel = selected.includes(n.id);
                  return (
                    <div
                      key={n.id}
                      className={`notif-row grid items-center w-full rounded-xl px-3 sm:px-4 py-2.5 sm:py-3 border bg-[#191919] 
                                  ${isSel ? "border-[#3a3a3a]" : "border-[#232323]"}
                                  md:transition-transform md:duration-150 md:ease-out md:hover:-translate-y-0.5 overflow-hidden`}
                      style={{ gridTemplateColumns: "auto auto minmax(0,1fr) auto", columnGap: "10px" }}
                    >
                      {/* checkbox */}
                      <input
                        type="checkbox"
                        checked={isSel}
                        onChange={() => toggleSelect(n.id)}
                        className="accent-[#81d742] w-5 h-5 shrink-0"
                        aria-label="select notification"
                      />

                      {/* dot */}
                      <Dot />

                      {/* TEXT (tek satır + ellipsis; mobilde küçük font) */}
                      <div className="min-w-0">
                        <span
                          className="block font-mono font-bold text-white truncate text-[12.5px] sm:text-[0.97rem]"
                          title={n.message}
                        >
                          {n.message}
                        </span>
                        <span className="block font-mono text-[11px] sm:text-xs text-gray-400 truncate">
                          {new Date(n.createdAt).toLocaleString()}
                        </span>
                      </div>

                      {/* Actions (ikon-only, sabit) */}
                      <div className="flex items-center gap-1.5 shrink-0 justify-end">
                        <button
                          className="p-1.5 rounded hover:bg-[#222222] transition"
                          title={tt("view", "Read")}
                          onClick={() => openViewer(n)}
                          aria-label={tt("view", "Read")}
                        >
                          <Eye size={18} className="text-gray-200" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-[#3a1717] transition"
                          onClick={() => deleteOne(n.id)}
                          aria-label={t("delete")}
                          title={t("delete")}
                        >
                          <Trash2 size={18} className="text-[#ff5555]" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Pagination */}
            <div className="flex justify-center gap-2 mt-7">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 rounded bg-[#161616] text-gray-200 font-mono font-bold text-sm disabled:opacity-50 hover:bg-[#1e1e1e]"
              >
                {"< Prev"}
              </button>
              <span className="text-gray-400 font-mono text-sm">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1.5 rounded bg-[#161616] text-gray-200 font-mono font-bold text-sm disabled:opacity-50 hover:bg-[#1e1e1e]"
              >
                {"Next >"}
              </button>
            </div>
          </section>
        </div>
      </main>

      {/* Modal */}
      {viewer && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center overscroll-contain" aria-modal="true" role="dialog">
          <div className="absolute inset-0 bg-black/60" onClick={closeViewer} aria-hidden="true" />
          <div className="w-full max-w-2xl mx-auto px-4 sm:px-6">
            <div
              className="relative bg-[#181818] border border-[#232323] rounded-2xl shadow-2xl p-5 sm:p-6"
              style={{ maxHeight: "90svh", overflow: "auto" }}
            >
              <div className="flex items-start justify-between gap-3 mb-2">
                <h3 className="text-white font-mono font-black text-xl">
                  {tt("viewNotification", "Notification")}
                </h3>
                <button
                  onClick={closeViewer}
                  className="p-2 rounded hover:bg-[#232323] text-gray-300"
                  aria-label={tt("close", "Close")}
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-gray-100 leading-relaxed whitespace-pre-wrap break-words">
                {viewer.message}
              </p>
              <p className="text-gray-500 text-xs mt-3 font-mono">
                {new Date(viewer.createdAt).toLocaleString()}
              </p>

              <div className="flex gap-2 justify-end mt-5">
                {viewer.link ? (
                  <a
                    href={viewer.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 rounded bg-[#262626] text-gray-100 font-mono font-bold hover:bg-[#2f2f2f] break-all"
                  >
                    {tt("openLink", "Open")}
                  </a>
                ) : null}
                <button
                  onClick={closeViewer}
                  className="px-3 py-1.5 rounded bg-[#ff5555] text-white font-mono font-bold hover:bg-[#ff6f6f]"
                >
                  {tt("close", "Close")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
