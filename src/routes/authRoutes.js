import express from "express"
import {
  login,
  getProfile,
  changePassword,
  createUser,
  getUsers,
  updateUser,
} from "../controllers/auth.controller.js"
import { authenticateToken, requireAdmin } from "../middleware/auth.js"
import {
  validateLogin,
  validatePasswordChange,
  validateCreateUser,
} from "../middleware/validation.js"

const router = express.Router()

// Rutas públicas
router.post("/login", validateLogin, login)

// Rutas protegidas
router.get("/profile", authenticateToken, getProfile)
router.post("/change-password", authenticateToken, validatePasswordChange, changePassword)

// Rutas solo para admin - Gestión de usuarios
router.post("/users", authenticateToken, requireAdmin, validateCreateUser, createUser)
router.get("/users", authenticateToken, requireAdmin, getUsers)
router.put("/users/:id", authenticateToken, requireAdmin, updateUser)
router.delete("/users/:id", authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params
    
    // No permitir que el admin se elimine a sí mismo
    if (parseInt(id) === req.user.id) {
      return res.status(400).json({
        success: false,
        message: "No puedes eliminar tu propio usuario",
        code: "CANNOT_DELETE_SELF"
      })
    }

    const { executeQuery } = await import("../config/database.js")
    
    // Verificar si el usuario existe
    const users = await executeQuery("SELECT id FROM users WHERE id = ?", [id])
    
    if (users.length === 0) {
      return res.status(404).json({
        success: false,
        message: "Usuario no encontrado",
        code: "USER_NOT_FOUND"
      })
    }

    // Eliminar usuario
    await executeQuery("DELETE FROM users WHERE id = ?", [id])

    res.json({
      success: true,
      message: "Usuario eliminado correctamente"
    })
  } catch (error) {
    console.error("Error eliminando usuario:", error)
    res.status(500).json({
      success: false,
      message: "Error interno del servidor",
      code: "INTERNAL_ERROR"
    })
  }
})

export default router
