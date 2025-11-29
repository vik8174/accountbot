import { Timestamp } from "firebase-admin/firestore";
import { tArray } from "../i18n";

/**
 * Format date as "15 січ" (localized short month, no time)
 * @param timestamp Firestore Timestamp
 * @returns Formatted date string
 */
export async function formatDate(timestamp: Timestamp): Promise<string> {
  const date = timestamp.toDate();
  const day = date.getDate();
  const monthIndex = date.getMonth();

  const months = await tArray("months.short");
  const monthName = months[monthIndex] || "";

  return `${day} ${monthName}`;
}
