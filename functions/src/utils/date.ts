import { Timestamp } from "firebase-admin/firestore";
import { tArray } from "../i18n";

/**
 * Format date as "15 січ 14:30" (localized short month)
 * @param timestamp Firestore Timestamp
 * @returns Formatted date string
 */
export async function formatDate(timestamp: Timestamp): Promise<string> {
  const date = timestamp.toDate();
  const day = date.getDate();
  const monthIndex = date.getMonth();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");

  const months = await tArray("months.short");
  const monthName = months[monthIndex] || "";

  return `${day} ${monthName} ${hours}:${minutes}`;
}
