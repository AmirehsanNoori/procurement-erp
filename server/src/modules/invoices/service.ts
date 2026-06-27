import { prisma } from '../../lib/prisma';
import { loadFinance } from '../finance/calc';

/**
 * Recompute and persist an invoice's auto-status from the current payments,
 * advance, and budget link. Returns the new status. Shared by invoice save
 * and payment registration so the workflow stays consistent.
 */
export async function recalcInvoiceStatus(tenantId: string, invoiceId: string): Promise<string | null> {
  const fin = await loadFinance(prisma, tenantId);
  const inv = fin.invoices.find((i) => i.id === invoiceId);
  if (!inv) return null;
  const next = fin.invoiceAutoStatus(inv);
  if (next !== inv.status) {
    await prisma.invoice.update({ where: { id: inv.id }, data: { status: next } });
  }
  return next;
}
