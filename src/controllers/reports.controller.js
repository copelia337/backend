import { executeQuery } from "../config/database.js"
import { buildSaleProfit, summarizeProfits } from "../utils/profitCalculator.js"
import { ensureSaleItemUnitCost, saleItemsHaveUnitCost } from "../utils/saleItemCost.js"

// Obtener reporte de ventas
export const getSalesReport = async (req, res) => {
  try {
    const { start_date, end_date, group_by = "day" } = req.query

    let dateFilter = "WHERE s.status = 'completed'"
    const params = []

    // Validar fechas
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      dateFilter += " AND DATE(s.created_at) >= ?"
      params.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      dateFilter += " AND DATE(s.created_at) <= ?"
      params.push(end_date)
    }

    // Validar agrupación
    const validGroupBy = ["hour", "day", "week", "month"]
    if (!validGroupBy.includes(group_by)) {
      return res.status(400).json({
        success: false,
        message: "Agrupación inválida. Debe ser: hour, day, week, month",
        code: "INVALID_GROUP_BY",
      })
    }

    // Determinar el formato de agrupación
    let dateFormat = "DATE(s.created_at)"
    let orderBy = "date"

    switch (group_by) {
      case "hour":
        dateFormat = "DATE_FORMAT(s.created_at, '%Y-%m-%d %H:00:00')"
        orderBy = "date"
        break
      case "day":
        dateFormat = "DATE(s.created_at)"
        break
      case "week":
        dateFormat = "DATE_FORMAT(s.created_at, '%Y-%u')"
        break
      case "month":
        dateFormat = "DATE_FORMAT(s.created_at, '%Y-%m')"
        break
    }

    const salesData = await executeQuery(
      `
      SELECT 
        ${dateFormat} as date,
        COUNT(*) as transactions,
        COALESCE(SUM(s.total), 0) as amount,
        COALESCE(SUM(si.quantity), 0) as products,
        COALESCE(AVG(s.total), 0) as average_ticket
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      ${dateFilter}
      GROUP BY ${dateFormat}
      ORDER BY ${orderBy} ASC
    `,
      params,
    )

    res.json({
      success: true,
      data: salesData,
    })
  } catch (error) {
    console.error("Error obteniendo reporte de ventas:", error)
    res.status(500).json({
      success: false,
      message: "Error obteniendo reporte de ventas",
      code: "SALES_REPORT_ERROR",
    })
  }
}

// ACTUALIZADO: Obtener productos más vendidos limitados a 10 con soporte para unidades
export const getTopProducts = async (req, res) => {
  try {
    const { start_date, end_date } = req.query
    const limit = 10 // FIJO: Siempre 10 productos

    let dateFilter = "WHERE s.status = 'completed'"
    const params = []

    // Validar fechas
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      dateFilter += " AND DATE(s.created_at) >= ?"
      params.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      dateFilter += " AND DATE(s.created_at) <= ?"
      params.push(end_date)
    }

    params.push(limit)

    // ACTUALIZADO: Incluir unit_type y sales_count
    const topProducts = await executeQuery(
      `
      SELECT 
        p.id,
        p.name,
        p.image,
        p.cost,
        p.price,
        p.unit_type,
        SUM(si.quantity) as quantity,
        COUNT(DISTINCT s.id) as sales_count,
        COALESCE(SUM(si.subtotal), 0) as revenue,
        ROUND(((p.price - COALESCE(p.cost, 0)) / p.price) * 100, 1) as margin
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      ${dateFilter}
      GROUP BY p.id, p.name, p.image, p.cost, p.price, p.unit_type
      ORDER BY quantity DESC
        LIMIT ${limit}
    `,
      params,
    )

    res.json({
      success: true,
      data: topProducts,
    })
  } catch (error) {
    console.error("Error obteniendo productos más vendidos:", error)
    res.status(500).json({
      success: false,
      message: "Error obteniendo productos más vendidos",
      code: "TOP_PRODUCTS_ERROR",
    })
  }
}

// ACTUALIZADO: Obtener mejores clientes limitados a 10
export const getTopCustomers = async (req, res) => {
  try {
    const { start_date, end_date } = req.query
    const limit = 10 // FIJO: Siempre 10 clientes

    let dateFilter = "WHERE s.status = 'completed' AND s.customer_id IS NOT NULL"
    const params = []

    // Validar fechas
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      dateFilter += " AND DATE(s.created_at) >= ?"
      params.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      dateFilter += " AND DATE(s.created_at) <= ?"
      params.push(end_date)
    }

    params.push(limit)

    const topCustomers = await executeQuery(
      `
      SELECT 
        c.id,
        c.name,
        c.email,
        c.phone,
        COUNT(s.id) as purchases,
        COALESCE(SUM(s.total), 0) as amount,
        MAX(s.created_at) as lastPurchase,
        COALESCE(AVG(s.total), 0) as average_purchase
      FROM customers c
      JOIN sales s ON c.id = s.customer_id
      ${dateFilter}
      GROUP BY c.id, c.name, c.email, c.phone
      ORDER BY amount DESC
        LIMIT ${limit}
    `,
      params,
    )

    res.json({
      success: true,
      data: topCustomers,
    })
  } catch (error) {
    console.error("Error obteniendo mejores clientes:", error)
    res.status(500).json({
      success: false,
      message: "Error obteniendo mejores clientes",
      code: "TOP_CUSTOMERS_ERROR",
    })
  }
}

// Obtener ventas por método de pago
export const getPaymentMethodsReport = async (req, res) => {
  try {
    const { start_date, end_date } = req.query

    let dateFilter = "WHERE s.status = 'completed'"
    const params = []

    // Validar fechas
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      dateFilter += " AND DATE(s.created_at) >= ?"
      params.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      dateFilter += " AND DATE(s.created_at) <= ?"
      params.push(end_date)
    }

    // Obtener total para calcular porcentajes
    const [totalResult] = await executeQuery(
      `SELECT COALESCE(SUM(total), 0) as total_amount FROM sales s ${dateFilter}`,
      params,
    )

    const totalAmount = Number.parseFloat(totalResult.total_amount) || 1 // Evitar división por cero

    const paymentMethods = await executeQuery(
      `
      SELECT 
        s.payment_method as method,
        COUNT(*) as transactions,
        COALESCE(SUM(s.total), 0) as amount,
        ROUND((COALESCE(SUM(s.total), 0) / ?) * 100, 1) as percentage
      FROM sales s
      ${dateFilter}
      GROUP BY s.payment_method
      ORDER BY amount DESC
    `,
      [totalAmount, ...params],
    )

    // Mapear nombres de métodos de pago
    const methodNames = {
      efectivo: "Efectivo",
      tarjeta_debito: "Tarjeta de Débito",
      tarjeta_credito: "Tarjeta de Crédito",
      transferencia: "Transferencia",
      cuenta_corriente: "Cuenta Corriente",
      multiple: "Múltiples Métodos",
    }

    const formattedMethods = paymentMethods.map((method) => ({
      ...method,
      method: methodNames[method.method] || method.method,
    }))

    res.json({
      success: true,
      data: formattedMethods,
    })
  } catch (error) {
    console.error("Error obteniendo reporte de métodos de pago:", error)
    res.status(500).json({
      success: false,
      message: "Error obteniendo reporte de métodos de pago",
      code: "PAYMENT_METHODS_ERROR",
    })
  }
}

// ACTUALIZADO: Obtener ventas por categoría con estadísticas por unidad
export const getCategoryReport = async (req, res) => {
  try {
    const { start_date, end_date } = req.query

    let dateFilter = "WHERE s.status = 'completed'"
    const params = []

    // Validar fechas
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      dateFilter += " AND DATE(s.created_at) >= ?"
      params.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      dateFilter += " AND DATE(s.created_at) <= ?"
      params.push(end_date)
    }

    // Obtener total para calcular porcentajes
    const [totalResult] = await executeQuery(
      `SELECT COALESCE(SUM(si.subtotal), 0) as total_amount 
      FROM sale_items si 
      JOIN sales s ON si.sale_id = s.id 
      ${dateFilter}`,
      params,
    )

    const totalAmount = Number.parseFloat(totalResult.total_amount) || 1 // Evitar división por cero

    // ACTUALIZADO: Incluir estadísticas por tipo de unidad
    const categoryData = await executeQuery(
      `
      SELECT 
        COALESCE(c.name, 'Sin categoría') as category,
        COUNT(DISTINCT p.id) as products,
        SUM(si.quantity) as quantity_sold,
        SUM(CASE WHEN p.unit_type = 'kg' THEN si.quantity ELSE 0 END) as kg_sold,
        SUM(CASE WHEN p.unit_type = 'unidades' THEN si.quantity ELSE 0 END) as units_sold,
        COUNT(CASE WHEN p.unit_type = 'kg' THEN 1 END) as kg_products,
        COUNT(CASE WHEN p.unit_type = 'unidades' THEN 1 END) as unit_products,
        COALESCE(SUM(si.subtotal), 0) as amount,
        ROUND((COALESCE(SUM(si.subtotal), 0) / ?) * 100, 1) as percentage
      FROM sale_items si
      JOIN sales s ON si.sale_id = s.id
      JOIN products p ON si.product_id = p.id
      LEFT JOIN categories c ON p.category_id = c.id
      ${dateFilter}
      GROUP BY c.id, c.name
      ORDER BY amount DESC
    `,
      [totalAmount, ...params],
    )

    res.json({
      success: true,
      data: categoryData,
    })
  } catch (error) {
    console.error("Error obteniendo reporte de categorías:", error)
    res.status(500).json({
      success: false,
      message: "Error obteniendo reporte de categorías",
      code: "CATEGORY_REPORT_ERROR",
    })
  }
}

// ACTUALIZADO: Obtener reporte de inventario con soporte para unidades
export const getInventoryReport = async (req, res) => {
  try {
    const { status_filter } = req.query

    let statusFilter = ""
    const params = []

    // Validar filtro de estado
    const validStatusFilters = ["all", "critical", "low", "normal"]
    if (status_filter && !validStatusFilters.includes(status_filter)) {
      return res.status(400).json({
        success: false,
        message: "Filtro de estado inválido. Debe ser: all, critical, low, normal",
        code: "INVALID_STATUS_FILTER",
      })
    }

    if (status_filter && status_filter !== "all") {
      switch (status_filter) {
        case "critical":
          statusFilter = "HAVING stock_status = 'critical'"
          break
        case "low":
          statusFilter = "HAVING stock_status = 'low'"
          break
        case "normal":
          statusFilter = "HAVING stock_status = 'normal'"
          break
      }
    }

    // ACTUALIZADO: Incluir unit_type en el reporte de inventario
    const inventoryData = await executeQuery(
      `
      SELECT 
        p.id,
        p.name as product,
        p.stock as currentStock,
        p.min_stock as minStock,
        p.unit_type,
        c.name as category,
        p.price,
        p.cost,
        CASE 
          WHEN p.stock = 0 THEN 'critical'
          WHEN p.stock <= p.min_stock THEN 'critical'
          WHEN p.stock <= (p.min_stock * 1.5) THEN 'low'
          ELSE 'normal'
        END as stock_status,
        (p.stock * COALESCE(p.cost, 0)) as inventory_value
      FROM products p
      LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.active = true
      ${statusFilter}
      ORDER BY 
        CASE 
          WHEN p.stock = 0 THEN 1
          WHEN p.stock <= p.min_stock THEN 2
          WHEN p.stock <= (p.min_stock * 1.5) THEN 3
          ELSE 4
        END,
        p.stock ASC, 
        p.name ASC
    `,
      params,
    )

    // ACTUALIZADO: Calcular estadísticas del inventario por tipo de unidad
    const stats = {
      total_products: inventoryData.length,
      critical_items: inventoryData.filter((item) => item.stock_status === "critical").length,
      low_items: inventoryData.filter((item) => item.stock_status === "low").length,
      normal_items: inventoryData.filter((item) => item.stock_status === "normal").length,
      total_value: inventoryData.reduce((sum, item) => sum + (Number.parseFloat(item.inventory_value) || 0), 0),
      // NUEVO: Estadísticas por tipo de unidad
      unit_products: inventoryData.filter((item) => item.unit_type === "unidades").length,
      kg_products: inventoryData.filter((item) => item.unit_type === "kg").length,
      unit_value: inventoryData
        .filter((item) => item.unit_type === "unidades")
        .reduce((sum, item) => sum + (Number.parseFloat(item.inventory_value) || 0), 0),
      kg_value: inventoryData
        .filter((item) => item.unit_type === "kg")
        .reduce((sum, item) => sum + (Number.parseFloat(item.inventory_value) || 0), 0),
    }

    res.json({
      success: true,
      data: {
        inventory: inventoryData,
        stats,
      },
    })
  } catch (error) {
    console.error("Error obteniendo reporte de inventario:", error)
    res.status(500).json({
      success: false,
      message: "Error obteniendo reporte de inventario",
      code: "INVENTORY_REPORT_ERROR",
    })
  }
}

// Obtener estadísticas generales para el dashboard de reportes
export const getReportsStats = async (req, res) => {
  try {
    const { start_date, end_date } = req.query

    let dateFilter = "WHERE s.status = 'completed'"
    const params = []

    // Validar fechas
    if (start_date && /^\d{4}-\d{2}-\d{2}$/.test(start_date)) {
      dateFilter += " AND DATE(s.created_at) >= ?"
      params.push(start_date)
    }

    if (end_date && /^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      dateFilter += " AND DATE(s.created_at) <= ?"
      params.push(end_date)
    }

    // Estadísticas generales
    const [generalStats] = await executeQuery(
      `
      SELECT 
        COUNT(*) as total_transactions,
        COALESCE(SUM(s.total), 0) as total_revenue,
        COALESCE(AVG(s.total), 0) as average_ticket,
        COALESCE(SUM(si.quantity), 0) as total_products_sold
      FROM sales s
      LEFT JOIN sale_items si ON s.id = si.sale_id
      ${dateFilter}
    `,
      params,
    )

    // Calcular crecimiento comparando con período anterior
    const growthStats = { revenue: 0, transactions: 0 }

    if (start_date && end_date) {
      const startDate = new Date(start_date)
      const endDate = new Date(end_date)
      const daysDiff = Math.ceil((endDate - startDate) / (1000 * 60 * 60 * 24))

      const previousStartDate = new Date(startDate)
      previousStartDate.setDate(previousStartDate.getDate() - daysDiff)
      const previousEndDate = new Date(startDate)
      previousEndDate.setDate(previousEndDate.getDate() - 1)

      const [previousStats] = await executeQuery(
        `
        SELECT 
          COUNT(*) as total_transactions,
          COALESCE(SUM(s.total), 0) as total_revenue
        FROM sales s
        WHERE s.status = 'completed'
        AND DATE(s.created_at) >= ?
        AND DATE(s.created_at) <= ?
      `,
        [previousStartDate.toISOString().split("T")[0], previousEndDate.toISOString().split("T")[0]],
      )

      if (previousStats.total_revenue > 0) {
        growthStats.revenue =
          ((generalStats.total_revenue - previousStats.total_revenue) / previousStats.total_revenue) * 100
      }

      if (previousStats.total_transactions > 0) {
        growthStats.transactions =
          ((generalStats.total_transactions - previousStats.total_transactions) / previousStats.total_transactions) *
          100
      }
    }

    res.json({
      success: true,
      data: {
        ...generalStats,
        growth: growthStats,
      },
    })
  } catch (error) {
    console.error("Error obteniendo estadísticas de reportes:", error)
    res.status(500).json({
      success: false,
      message: "Error obteniendo estadísticas de reportes",
      code: "REPORTS_STATS_ERROR",
    })
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function artDay(column) {
  return `DATE(${column})`
}

function artKey(column) {
  return `DATE_FORMAT(${column}, '%Y-%m-%d')`
}

function groupSaleRows(rows) {
  const sales = new Map()

  for (const row of rows) {
    if (!sales.has(row.id)) {
      sales.set(row.id, {
        sale: {
          id: row.id,
          created_at: row.created_at,
          sale_date: row.sale_date,
          subtotal: row.subtotal,
          discount: row.discount,
          tax: row.tax,
          total: row.total,
          payment_method: row.payment_method,
          customer_name: row.customer_name,
          cashier_name: row.cashier_name,
        },
        items: [],
      })
    }

    if (row.item_id != null) {
      sales.get(row.id).items.push({
        id: row.item_id,
        product_id: row.product_id,
        product_name: row.product_name,
        quantity: row.quantity,
        unit_price: row.unit_price,
        unit_cost: row.unit_cost,
        subtotal: row.item_subtotal,
        unit_type: row.unit_type,
      })
    }
  }

  return Array.from(sales.values()).map(({ sale, items }) => buildSaleProfit(sale, items))
}

// Ganancia del rango: precio cobrado menos costo, y egresos de caja (gastos y retiros).
export const getProfitsReport = async (req, res) => {
  try {
    const { start_date, end_date } = req.query

    if (!DATE_PATTERN.test(start_date || "") || !DATE_PATTERN.test(end_date || "")) {
      return res.status(400).json({
        success: false,
        message: "Indicá un rango de fechas válido",
        code: "INVALID_DATE_RANGE",
      })
    }

    if (start_date > end_date) {
      return res.status(400).json({
        success: false,
        message: "La fecha inicial no puede ser posterior a la fecha final",
        code: "INVALID_DATE_RANGE",
      })
    }

    try {
      await ensureSaleItemUnitCost()
    } catch (migrationError) {
      console.error("No se pudo preparar el costo histórico de las ventas:", migrationError)
    }

    const hasUnitCost = await saleItemsHaveUnitCost()
    const unitCostSql = hasUnitCost ? "COALESCE(si.unit_cost, p.cost, 0)" : "COALESCE(p.cost, 0)"

    const [saleRows, expenseRows, cancelledRows] = await Promise.all([
      executeQuery(
        `
        SELECT
          s.id,
          s.created_at,
          ${artKey("s.created_at")} AS sale_date,
          s.subtotal,
          s.discount,
          s.tax,
          s.total,
          s.payment_method,
          c.name AS customer_name,
          u.name AS cashier_name,
          si.id AS item_id,
          si.product_id,
          si.quantity,
          si.unit_price,
          si.subtotal AS item_subtotal,
          ${unitCostSql} AS unit_cost,
          COALESCE(si.unit_type, p.unit_type, 'unidades') AS unit_type,
          p.name AS product_name
        FROM sales s
        LEFT JOIN customers c ON c.id = s.customer_id
        LEFT JOIN users u ON u.id = s.user_id
        LEFT JOIN sale_items si ON si.sale_id = s.id
        LEFT JOIN products p ON p.id = si.product_id
        WHERE s.status = 'completed'
          AND ${artDay("s.created_at")} >= ?
          AND ${artDay("s.created_at")} <= ?
        ORDER BY s.created_at DESC, s.id DESC, si.id ASC
        `,
        [start_date, end_date],
      ),
      executeQuery(
        `
        SELECT
          cm.id,
          cm.type,
          ABS(cm.amount) AS amount,
          cm.description,
          cm.reference,
          cm.payment_method,
          cm.created_at,
          ${artKey("cm.created_at")} AS sale_date,
          u.name AS user_name
        FROM cash_movements cm
        LEFT JOIN users u ON u.id = cm.user_id
        WHERE cm.type IN ('expense', 'withdrawal')
          AND ${artDay("cm.created_at")} >= ?
          AND ${artDay("cm.created_at")} <= ?
        ORDER BY cm.created_at DESC, cm.id DESC
        `,
        [start_date, end_date],
      ),
      executeQuery(
        `
        SELECT COUNT(*) AS count, COALESCE(SUM(total), 0) AS total
        FROM sales
        WHERE status = 'cancelled'
          AND ${artDay("created_at")} >= ?
          AND ${artDay("created_at")} <= ?
        `,
        [start_date, end_date],
      ),
    ])

    const sales = groupSaleRows(saleRows)
    const expenses = expenseRows.map((movement) => ({
      id: movement.id,
      type: movement.type,
      amount: Number(movement.amount) || 0,
      description: movement.description || "",
      reference: movement.reference || "",
      payment_method: movement.payment_method,
      created_at: movement.created_at,
      sale_date: movement.sale_date,
      user_name: movement.user_name || "Sistema",
    }))
    const cancelled = cancelledRows[0] || { count: 0, total: 0 }

    res.json({
      success: true,
      data: {
        range: { start_date, end_date },
        summary: summarizeProfits(sales, expenses, cancelled),
        sales,
        expenses,
      },
    })
  } catch (error) {
    console.error("Error obteniendo reporte de ganancias:", error)
    res.status(500).json({
      success: false,
      message: "Error obteniendo el reporte de ganancias",
      code: "PROFITS_REPORT_ERROR",
    })
  }
}
