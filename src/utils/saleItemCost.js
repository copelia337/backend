import { executeQuery } from "../config/database.js"

let hasUnitCostColumn = null
let ensurePromise = null

export async function saleItemsHaveUnitCost() {
  if (hasUnitCostColumn !== null) return hasUnitCostColumn

  const rows = await executeQuery(
    `SELECT COUNT(*) AS total
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'sale_items'
       AND COLUMN_NAME = 'unit_cost'`,
  )

  hasUnitCostColumn = Number(rows[0]?.total || 0) > 0
  return hasUnitCostColumn
}

async function ensureSaleItemUnitCostOnce() {
  const exists = await saleItemsHaveUnitCost()
  if (!exists) {
    await executeQuery(
      "ALTER TABLE sale_items ADD COLUMN unit_cost DECIMAL(10,2) NULL DEFAULT NULL AFTER unit_price",
    )
    hasUnitCostColumn = true
  }
}

// Guarda el costo en las ventas nuevas. Las ventas anteriores siguen el costo actual del producto.
export function ensureSaleItemUnitCost() {
  if (!ensurePromise) {
    ensurePromise = ensureSaleItemUnitCostOnce().catch((error) => {
      ensurePromise = null
      throw error
    })
  }
  return ensurePromise
}
