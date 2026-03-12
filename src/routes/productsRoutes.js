import express from "express"
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  getStockMovements,
  createStockMovement,
  getStockAlerts,
  getStockStats,
  getStockCapital,
  getTopSellingProducts,
} from "../controllers/products.controller.js"
import { authenticateToken, requireRole } from "../middleware/auth.js"
import { validateCreateProduct, validateUpdateProduct, validateStockMovement } from "../middleware/validation.js"

const router = express.Router()

// Todas las rutas requieren autenticación
router.use(authenticateToken)

// Rutas de productos
router.get("/", getProducts)
router.get("/top-selling", getTopSellingProducts)
router.get("/stats", getStockStats)
router.get("/stock-capital", getStockCapital)
router.get("/alerts", getStockAlerts)
router.get("/:id", getProductById)
router.post("/", validateCreateProduct, createProduct)
router.put("/:id", validateUpdateProduct, updateProduct)
router.delete("/:id", requireRole(["admin"]), deleteProduct)

// Rutas de movimientos de stock
router.get("/movements/list", getStockMovements)
router.post("/movements", validateStockMovement, createStockMovement)

export default router

