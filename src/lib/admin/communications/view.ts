import {
  communicationFilterOrder,
  communicationGroup,
  type CommunicationFilter,
  type CustomerCommunication,
} from "@/lib/admin/communications/types";

/**
 * How the communication list is ordered and filtered.
 *
 * Kept out of the component so the two rules that matter -- newest first, and
 * a filter that never hides a row into nothing -- can be tested without a
 * browser, and so the page and any later view agree on them.
 */

/**
 * When the customer received it. The send time is the truth; `createdAt` only
 * stands in for a row that somehow carries no send time, so an unexpected row
 * still sorts somewhere sensible instead of to the bottom of the list.
 */
export function communicationMoment(communication: CustomerCommunication): string {
  return communication.sentAt ?? communication.createdAt;
}

/**
 * Newest first, with `createdAt` breaking a tie: an invoice and the mail that
 * follows it in the same second keep the order they were written in.
 */
export function sortCommunications(communications: CustomerCommunication[]): CustomerCommunication[] {
  return [...communications].sort(
    (a, b) =>
      communicationMoment(b).localeCompare(communicationMoment(a)) || b.createdAt.localeCompare(a.createdAt),
  );
}

export function filterCommunications(
  communications: CustomerCommunication[],
  filter: CommunicationFilter,
): CustomerCommunication[] {
  if (filter === "all") return communications;
  return communications.filter((communication) => communicationGroup(communication.category) === filter);
}

/** Sorted and filtered in one pass, which is all the list view ever needs. */
export function communicationRows(
  communications: CustomerCommunication[],
  filter: CommunicationFilter,
): CustomerCommunication[] {
  return sortCommunications(filterCommunications(communications, filter));
}

/** How many mails each filter would show, for the counts beside the buttons. */
export function communicationCounts(
  communications: CustomerCommunication[],
): Record<CommunicationFilter, number> {
  const counts = Object.fromEntries(communicationFilterOrder.map((filter) => [filter, 0])) as Record<
    CommunicationFilter,
    number
  >;

  for (const communication of communications) {
    counts.all += 1;
    counts[communicationGroup(communication.category)] += 1;
  }

  return counts;
}
