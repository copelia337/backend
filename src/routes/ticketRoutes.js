import express from "express"
import {
  getBusinessConfig,
  updateBusinessConfig,
  getTicketConfig,
  updateTicketConfig,
  getAllConfig
} from "../controllers/ticket.controller.js"
import { protect } from "../middleware/auth.js"

const router = express.Router()

// Proteger todas las rutas
router.use(protect)

// Rutas de configuración del negocio
router.get("/business", getBusinessConfig)
router.put("/business", updateBusinessConfig)

// Rutas de configuración de tickets
router.get("/ticket", getTicketConfig)
router.put("/ticket", updateTicketConfig)

// Ruta para obtener toda la configuración
router.get("/all", getAllConfig)

export default router
