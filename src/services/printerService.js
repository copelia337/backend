import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer'
import { executeQuery } from '../config/database.js'

class PrinterService {
  constructor() {
    this.printer = null
    this.isConnected = false
    this.connectedPrinterName = null
  }

  /**
   * Inicializar servicio y cargar configuración
   */
  async initialize() {
    try {
      const config = await executeQuery('SELECT * FROM ticket_config LIMIT 1')
      if (config.length > 0 && config[0].printer_name) {
        console.log('[PRINTER] Auto-conectando a:', config[0].printer_name)
        await this.connect(config[0].printer_name)
      }
    } catch (error) {
      console.log('[PRINTER] No se pudo auto-conectar:', error.message)
    }
  }

  /**
   * Detectar impresoras disponibles en Windows
   */
  async detectPrinters() {
    try {
      console.log('[PRINTER] Detectando impresoras del sistema...')
      
      // Crear instancia temporal
      const tempPrinter = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: 'printer:Auto'
      })

      const printers = await tempPrinter.getPrinters()
      console.log('[PRINTER] Impresoras encontradas:', printers.length)

      return printers.map(name => ({
        name,
        type: 'WINDOWS',
        path: name,
        manufacturer: 'Sistema Windows'
      }))
    } catch (error) {
      console.error('[PRINTER] Error detectando:', error.message)
      return []
    }
  }

  /**
   * Conectar a una impresora específica
   */
  async connect(printerName) {
    try {
      console.log('[PRINTER] Conectando a:', printerName)

      this.printer = new ThermalPrinter({
        type: PrinterTypes.EPSON,
        interface: `printer:${printerName}`,
        characterSet: 'PC437_USA',
        removeSpecialCharacters: false,
        lineCharacter: '-',
        options: {
          timeout: 5000
        }
      })

      const connected = await this.printer.isPrinterConnected()
      
      if (!connected) {
        throw new Error('No se pudo verificar la conexión con la impresora')
      }

      this.isConnected = true
      this.connectedPrinterName = printerName
      console.log('[PRINTER] Conectado exitosamente')
      
      return { success: true, message: 'Impresora conectada correctamente' }
    } catch (error) {
      console.error('[PRINTER] Error de conexión:', error.message)
      this.isConnected = false
      throw error
    }
  }

  /**
   * Imprimir ticket usando comandos ESC/POS
   */
  async print(escposCommands) {
    if (!this.isConnected || !this.printer) {
      throw new Error('Impresora no conectada')
    }

    try {
      console.log('[PRINTER] Imprimiendo ticket...')

      // Limpiar buffer
      this.printer.clear()

      // Enviar comandos ESC/POS como raw
      this.printer.raw(Buffer.from(escposCommands, 'binary'))

      // Ejecutar impresión
      await this.printer.execute()

      console.log('[PRINTER] Ticket impreso correctamente')
      return { success: true, message: 'Ticket impreso correctamente' }
    } catch (error) {
      console.error('[PRINTER] Error al imprimir:', error.message)
      throw error
    }
  }

  /**
   * Imprimir ticket de prueba
   */
  async printTest() {
    if (!this.isConnected || !this.printer) {
      throw new Error('Impresora no conectada')
    }

    try {
      this.printer.clear()
      this.printer.alignCenter()
      this.printer.bold(true)
      this.printer.setTextDoubleHeight()
      this.printer.println('PRUEBA DE IMPRESORA')
      this.printer.setTextNormal()
      this.printer.bold(false)
      this.printer.newLine()
      this.printer.alignLeft()
      this.printer.println('Si puede leer este texto,')
      this.printer.println('su impresora funciona correctamente.')
      this.printer.newLine()
      this.printer.println(`Fecha: ${new Date().toLocaleString('es-AR')}`)
      this.printer.newLine()
      this.printer.newLine()
      this.printer.newLine()
      this.printer.cut()

      await this.printer.execute()

      console.log('[PRINTER] Ticket de prueba impreso')
      return { success: true }
    } catch (error) {
      console.error('[PRINTER] Error en prueba:', error.message)
      throw error
    }
  }

  /**
   * Obtener estado de la conexión
   */
  getStatus() {
    return {
      connected: this.isConnected,
      printerName: this.connectedPrinterName,
      type: 'WINDOWS'
    }
  }

  /**
   * Desconectar
   */
  disconnect() {
    this.printer = null
    this.isConnected = false
    this.connectedPrinterName = null
    console.log('[PRINTER] Desconectado')
  }
}

export default new PrinterService()
