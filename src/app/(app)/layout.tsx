import Link from "next/link";
import { redirect } from "next/navigation";
import { logout, requireUser } from "@/server/auth";

const NAV = [
  { heading: "Overview", links: [{ href: "/dashboard", label: "Dashboard" }] },
  {
    heading: "Sales",
    links: [
      { href: "/sales/invoices", label: "Invoices" },
      { href: "/sales/credit-notes", label: "Credit Notes" },
      { href: "/sales/debit-notes", label: "Debit Notes" },
      { href: "/einvoice", label: "e-Invoice Monitor" },
      { href: "/ar/receipts", label: "Receipts" },
    ],
  },
  {
    heading: "Purchases",
    links: [
      { href: "/purchases/bills", label: "Supplier Bills" },
      { href: "/purchases/orders", label: "Purchase Orders" },
      { href: "/ap/payments", label: "Payments" },
    ],
  },
  {
    heading: "Master Data",
    links: [
      { href: "/customers", label: "Customers" },
      { href: "/suppliers", label: "Suppliers" },
      { href: "/items", label: "Items" },
      { href: "/tax-codes", label: "Tax Codes" },
    ],
  },
  {
    heading: "Accounting",
    links: [
      { href: "/gl/accounts", label: "Chart of Accounts" },
      { href: "/gl/journals", label: "Journal Entries" },
      { href: "/gl/reports/trial-balance", label: "Trial Balance" },
      { href: "/gl/reports/profit-loss", label: "Profit & Loss" },
      { href: "/gl/reports/balance-sheet", label: "Balance Sheet" },
      { href: "/reports/aging", label: "AR/AP Aging" },
    ],
  },
  {
    heading: "Stock",
    links: [
      { href: "/stock", label: "Stock Balances" },
      { href: "/stock/adjustments", label: "Adjustments" },
    ],
  },
  {
    heading: "Settings",
    links: [
      { href: "/settings/company", label: "Company Profile" },
      { href: "/settings/einvoice", label: "e-Invoice (MyInvois)" },
      { href: "/settings/users", label: "Users" },
    ],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();

  async function logoutAction() {
    "use server";
    await logout();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <span className="text-sm font-semibold text-gray-900">Accounting</span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto px-2 py-3">
          {NAV.map((section) => (
            <div key={section.heading}>
              <div className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                {section.heading}
              </div>
              {section.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="block rounded-md px-2 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="border-t border-gray-200 px-4 py-3">
          <div className="mb-2 text-xs text-gray-500">{user.displayName}</div>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-gray-500 underline hover:text-gray-700">
              Sign out
            </button>
          </form>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-6">{children}</main>
    </div>
  );
}
