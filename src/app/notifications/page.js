// src/app/notifications/page.js
"use client";

import { useState, useMemo } from "react";
import Layout from "@/components/Layout";
import { useNotifications } from "@/hooks/useNotifications";
import useTranslation from "@/hooks/useTranslation";
import { Bell, CheckCircle, Trash2 } from "lucide-react";

const NOTIFS_PER_PAGE = 8;

function NotificationTypeDot({ type }) {
  let color = "#81d742";
  if (type === "important") color = "#ff5555";
  if (type === "support_reply") color = "#339fff";
  return (
    <span
      title={type}
      className="inline-block rounded-full mr-2"
      style={{
        width: 10,
        height: 10,
        minWidth: 10,
        minHeight: 10,
        background: color,
        marginTop: 2,
        boxShadow: "0 0 0 1.4px #1a1a1a",
      }}
    />
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, markSelectedAsRead, deleteNotifications, unreadCount } = useNotifications(true);

  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(1);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil((notifications?.length || 0) / NOTIFS_PER_PAGE)),
    [notifications]
  );
  const pageNotifs = useMemo(
    () =>
      Array.isArray(notifications)
        ? notifications.slice((page - 1) * NOTIFS_PER_PAGE, page * NOTIFS_PER_PAGE)
        : [],
    [notifications, page]
  );

  const toggleSelect = (id) =>
    setSelected((sel) => (sel.includes(id) ? sel.filter((i) => i !== id) : [...sel, id]));

  const allSelected = pageNotifs.length > 0 && pageNotifs.every((n) => selected.includes(n.id));
  const handleSelectAll = () => {
    if (!pageNotifs.length) return;
    if (allSelected) {
      setSelected((sel) => sel.filter((id) => !pageNotifs.map((n) => n.id).includes(id)));
    } else {
      setSelected((sel) => [...sel, ...pageNotifs.map((n) => n.id).filter((id) => !sel.includes(id))]);
    }
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

  const renderReadIcon = (read) => (
    <CheckCircle size={20} className={read ? "text-[#81d742]" : "text-gray-500 opacity-60"} />
  );

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[78vh] w-full py-7 px-2 bg-transparent">
        <div
          className="w-full max-w-xl rounded-2xl bg-[#181818] border border-[#232323] shadow-xl px-6 pt-7 pb-2 mx-auto"
          style={{ minHeight: 650 }}
        >
          <div className="flex items-center gap-3 mb-3">
            <span className="relative">
              <Bell size={26} className="text-[#81d742] mr-1" />
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -left-1 w-2.5 h-2.5 bg-[#ff5555] border-2 border-[#181818] rounded-full animate-pulse"></span>
              )}
            </span>
            <h2 className="text-2xl font-black font-mono text-white">{t("notifications")}</h2>
          </div>

          <div className="flex gap-3 mb-3 flex-wrap">
            <button
              onClick={handleMarkAsRead}
              className="bg-[#81d742] hover:bg-[#aaf966] text-[#181818] font-bold font-mono px-3 py-1.5 rounded-md transition text-sm disabled:opacity-50"
              disabled={!selected.length}
            >
              {t("markSelectedAsRead")}
            </button>
            <button
              onClick={handleDeleteSelected}
              className="bg-[#ff5555] hover:bg-[#ff7a7a] text-white font-bold font-mono px-3 py-1.5 rounded-md transition text-sm disabled:opacity-50"
              disabled={!selected.length}
            >
              {t("deleteSelected")}
            </button>
          </div>

          <div className="flex items-center mb-3">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={handleSelectAll}
              className="accent-[#81d742] w-4 h-4 mr-2"
              id="select-all"
            />
            <label htmlFor="select-all" className="text-white text-sm font-mono">
              {t("selectAll")}
            </label>
          </div>

          <div className="flex flex-col gap-2 pb-1 min-h-[378px]">
            {pageNotifs.length === 0 && (
              <div className="text-gray-400 font-mono text-sm py-10 text-center flex-1">
                {t("nonotifications")}
              </div>
            )}
            {pageNotifs.map((n) => (
              <div
                key={n.id}
                className={`flex items-center gap-2 w-full rounded-xl px-5 py-3 border
                  ${selected.includes(n.id) ? "border-[#81d742] shadow-lg bg-[#202620]" : "border-[#232323]"}
                  bg-[#191919] transition relative group`}
                style={{ minHeight: 54, alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={selected.includes(n.id)}
                  onChange={() => toggleSelect(n.id)}
                  className="accent-[#81d742] w-4 h-4 mr-1"
                />
                <NotificationTypeDot type={n.type} />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="font-mono text-base font-bold text-white truncate" title={n.message}>
                    {n.message}
                  </span>
                  <span className="font-mono text-xs text-gray-400">
                    {new Date(n.createdAt).toLocaleString()}
                  </span>
                </div>
                <span className="mx-1">{renderReadIcon(n.read)}</span>
                <button
                  className="ml-2 p-1.5 rounded hover:bg-[#ff555520] transition"
                  onClick={() => deleteNotifications([n.id])}
                  aria-label={t("delete")}
                >
                  <Trash2 size={19} className="text-[#ff5555]" />
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-2 mt-10 mb-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1 rounded bg-[#161616] text-gray-300 font-mono font-bold text-sm disabled:opacity-50"
            >
              {"< Prev"}
            </button>
            <span className="text-gray-400 font-mono text-sm">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1 rounded bg-[#161616] text-gray-300 font-mono font-bold text-sm disabled:opacity-50"
            >
              {"Next >"}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
