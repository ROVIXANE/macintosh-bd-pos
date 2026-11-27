import { StoreSettings, Sale } from '@/lib/types'
import { formatDateTime, formatMoney } from '@/lib/utils'

export function InvoiceSheet({ sale, settings, layout = 'a4' }: {
  sale: Sale
  settings: Partial<StoreSettings> & { store_name?: string; currency_symbol?: string; timezone?: string }
  layout?: 'a4' | '80mm' | '58mm'
}) {
  const symbol = settings.currency_symbol ?? '৳'
  const thermal = layout !== 'a4'
  return (
    <div className={`invoice-sheet mx-auto bg-white p-6 text-slate-900 ${thermal ? 'max-w-[80mm] text-[11px]' : 'max-w-3xl'}`}>
      <div className="text-center">
        {settings.logo_url && <img src={settings.logo_url} alt="Store logo" className="mx-auto mb-2 h-16 object-contain" />}
        <h1 className={thermal ? 'text-base font-bold' : 'text-2xl font-bold'}>{settings.store_name ?? 'Macintosh BD'}</h1>
        <p className="text-xs">{settings.address ?? 'Dhaka, Bangladesh'}</p>
        <p className="text-xs">Phone: {settings.phone ?? '—'} · {settings.email ?? ''}</p>
      </div>

      <div className="my-4 border-y border-dashed border-slate-300 py-2 text-xs">
        <div className="flex justify-between"><span>Invoice</span><strong>{sale.invoice_number}</strong></div>
        <div className="flex justify-between"><span>Date</span><span>{formatDateTime(sale.sale_date)}</span></div>
        <div className="flex justify-between"><span>Customer</span><span>{sale.customer?.name ?? 'Walk-in customer'}</span></div>
        {sale.customer?.phone && <div className="flex justify-between"><span>Phone</span><span>{sale.customer.phone}</span></div>}
        <div className="flex justify-between"><span>Cashier</span><span>{sale.employee?.full_name ?? '—'}</span></div>
      </div>

      <table className="w-full text-left text-xs">
        <thead><tr className="border-b border-slate-300"><th className="py-1">Item</th><th>Qty</th><th className="text-right">Price</th><th className="text-right">Total</th></tr></thead>
        <tbody>
          {(sale.items ?? []).map((item) => (
            <tr key={item.id} className="border-b border-slate-100 align-top">
              <td className="py-1 pr-2">
                <p className="font-medium">{item.product_name ?? item.product?.name ?? item.product_id.slice(0, 8)}</p>
                {item.serial_number && <p className="text-[10px] text-slate-500">S/N {item.serial_number}</p>}
                {item.discount > 0 && <p className="text-[10px] text-slate-500">Discount {formatMoney(item.discount, symbol)}</p>}
              </td>
              <td>{item.quantity}</td>
              <td className="text-right">{formatMoney(item.unit_price, symbol)}</td>
              <td className="text-right">{formatMoney(item.subtotal, symbol)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-full max-w-[240px] space-y-1 text-xs">
        <div className="flex justify-between"><span>Subtotal</span><span>{formatMoney(sale.subtotal, symbol)}</span></div>
        <div className="flex justify-between"><span>Discount</span><span>-{formatMoney(sale.discount, symbol)}</span></div>
        <div className="flex justify-between"><span>Tax</span><span>{formatMoney(sale.tax, symbol)}</span></div>
        <div className="flex justify-between"><span>Delivery</span><span>{formatMoney(sale.delivery, symbol)}</span></div>
        <div className="flex justify-between border-t border-slate-300 pt-1 text-sm font-bold"><span>Total</span><span>{formatMoney(sale.total, symbol)}</span></div>
        <div className="flex justify-between"><span>Paid</span><span>{formatMoney(sale.paid, symbol)}</span></div>
        <div className="flex justify-between"><span>Due</span><span>{formatMoney(sale.due, symbol)}</span></div>
      </div>

      {(sale.payments?.length ?? 0) > 0 && (
        <div className="mt-4 text-xs">
          <p className="font-semibold">Payments</p>
          {sale.payments?.map((payment) => (
            <div key={payment.id} className="flex justify-between"><span>{payment.method}{payment.reference ? ` · ${payment.reference}` : ''}</span><span>{formatMoney(payment.amount, symbol)}</span></div>
          ))}
        </div>
      )}

      <p className="mt-6 text-center text-xs">{settings.receipt_footer ?? 'Thank you for shopping with Macintosh BD'}</p>
      <p className="mt-1 text-center text-[10px] text-slate-400">Timezone {settings.timezone ?? 'Asia/Dhaka'} · Finalized invoice</p>
    </div>
  )
}
