const clickLogs = {};

export function logClick(userId, ip) {
  const now = Date.now();
  if (!clickLogs[userId]) clickLogs[userId] = [];
  clickLogs[userId] = clickLogs[userId].filter(ts => now - ts < 60000);
  clickLogs[userId].push(now);
  return clickLogs[userId].length;
}

export function checkClickFlood(userId, ip, limit = 20) {
  // Son 1 dakikadaki tıklama sayısı limitten fazla mı?
  return logClick(userId, ip) > limit;
}
// NOT: Launch sonrası memory'den Redis/Mongo gibi merkezi store'a taşı!
