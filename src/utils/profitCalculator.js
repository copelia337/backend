// Cálculo de ganancias en centavos para que los totales del rango cierren exactos.

export function toCents(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return 0
  return Math.round(amount * 100)
}

export function fromCents(cents) {
  return Math.round(cents) / 100
}

export function marginPercent(profitCents, baseCents) {
  if (!baseCents) return 0
  return Math.round((profitCents / baseCents) * 1000) / 10
}

function lineCostCents(quantity, unitCost) {
  const qty = Number(quantity)
  const cost = Number(unitCost)
  if (!Number.isFinite(qty) || !Number.isFinite(cost)) return 0
  return toCents(qty * cost)
}

export function buildSaleProfit(sale, rawItems = []) {
  const totalCents = toCents(sale.total)
  const items = (rawItems || []).map((item) => {
    const quantity = Number(item.quantity) || 0
    const unitPrice = Number(item.unit_price) || 0
    const hasCost = item.unit_cost !== null && item.unit_cost !== undefined && item.unit_cost !== ""
    const unitCost = hasCost ? Number(item.unit_cost) || 0 : 0
    const subtotalCents = toCents(item.subtotal != null ? item.subtotal : quantity * unitPrice)
    const costCents = lineCostCents(quantity, unitCost)

    return {
      id: item.id,
      product_id: item.product_id,
      product_name: item.product_name || "Producto",
      quantity,
      unit_type: item.unit_type || "unidades",
      unit_price: fromCents(toCents(unitPrice)),
      unit_cost: fromCents(toCents(unitCost)),
      subtotal: fromCents(subtotalCents),
      cost: fromCents(costCents),
      missing_cost: !hasCost || unitCost === 0,
      _subtotalCents: subtotalCents,
      _costCents: costCents,
    }
  })

  const subtotalCents = items.reduce((sum, item) => sum + item._subtotalCents, 0)
  let assignedRevenue = 0

  items.forEach((item, index) => {
    let revenueCents = 0
    if (index === items.length - 1) {
      revenueCents = totalCents - assignedRevenue
    } else if (subtotalCents === 0) {
      revenueCents = Math.floor(totalCents / items.length)
      assignedRevenue += revenueCents
    } else {
      revenueCents = Math.floor((totalCents * item._subtotalCents) / subtotalCents)
      assignedRevenue += revenueCents
    }

    item.revenue = fromCents(revenueCents)
    item.profit = fromCents(revenueCents - item._costCents)
    item.margin = marginPercent(revenueCents - item._costCents, revenueCents)
    delete item._subtotalCents
    delete item._costCents
  })

  const costCents = items.reduce((sum, item) => sum + toCents(item.cost), 0)
  const profitCents = totalCents - costCents

  return {
    id: sale.id,
    created_at: sale.created_at,
    sale_date: sale.sale_date,
    customer_name: sale.customer_name || "Cliente general",
    cashier_name: sale.cashier_name || "Sistema",
    payment_method: sale.payment_method,
    discount: fromCents(toCents(sale.discount)),
    tax: fromCents(toCents(sale.tax)),
    total: fromCents(totalCents),
    cost: fromCents(costCents),
    profit: fromCents(profitCents),
    margin: marginPercent(profitCents, totalCents),
    items,
    missing_cost_items: items.length === 0 ? 1 : items.filter((item) => item.missing_cost).length,
  }
}

export function summarizeProfits(sales, expenses, cancelled = {}) {
  const salesTotal = sales.reduce((sum, sale) => sum + toCents(sale.total), 0)
  const costTotal = sales.reduce((sum, sale) => sum + toCents(sale.cost), 0)
  const grossProfit = salesTotal - costTotal
  const expenseAmount = expenses
    .filter((movement) => movement.type === "expense")
    .reduce((sum, movement) => sum + toCents(movement.amount), 0)
  const withdrawalAmount = expenses
    .filter((movement) => movement.type === "withdrawal")
    .reduce((sum, movement) => sum + toCents(movement.amount), 0)
  const expensesTotal = expenseAmount + withdrawalAmount

  return {
    sales_count: sales.length,
    sales_total: fromCents(salesTotal),
    cost_total: fromCents(costTotal),
    gross_profit: fromCents(grossProfit),
    gross_margin: marginPercent(grossProfit, salesTotal),
    expenses_total: fromCents(expensesTotal),
    expenses_count: expenses.length,
    expense_amount: fromCents(expenseAmount),
    withdrawal_amount: fromCents(withdrawalAmount),
    net_profit: fromCents(grossProfit - expensesTotal),
    sales_result: fromCents(salesTotal - expensesTotal),
    missing_cost_items: sales.reduce((sum, sale) => sum + (sale.missing_cost_items || 0), 0),
    cancelled_count: Number(cancelled.count) || 0,
    cancelled_total: fromCents(toCents(cancelled.total)),
  }
}
