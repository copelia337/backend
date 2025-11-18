import escpos from 'escpos'
import USB from 'usb'
import { executeQuery } from '../config/database.js'
import { ThermalPrinter, PrinterTypes } from 'node-thermal-printer'

class PrinterService {
  constructor() {
    this.device = null
    this.thermalPrinter = null
    this.isConnected = false
    this.printerName = null
    this.printerConfig = null
    this.printerType = null // 'USB' or 'WINDOWS'
  }

  async initialize() {
    try {
      const config = await executeQuery('SELECT * FROM ticket_config LIMIT 1')
      if (config.length > 0) {
        this.printerConfig = config[0]
        console.log('[PRINTER] Configuración cargada:', {
          printerName: this.printerConfig.printer_name,
          baudRate: this.printerConfig.baud_rate || 9600
        })
        
        // Try to auto-connect if printer name is saved
        if (this.printerConfig.printer_name) {
          try {
            await this.connectToPrinter(this.printerConfig.printer_name)
            console.log('[PRINTER] Auto-conectado a:', this.printerConfig.printer_name)
          } catch (error) {
            console.log('[PRINTER] No se pudo auto-conectar:', error.message)
          }
        }
      }
    } catch (error) {
      console.error('[PRINTER] Error al cargar configuración:', error.message)
    }
  }

  async detectPrinters() {
    try {
      const allPrinters = []
      
      // 1. Detect USB thermal printers
      try {
        const usbDevices = USB.getDeviceList()
        console.log('[PRINTER] Dispositivos USB encontrados:', usbDevices.length)
        
        // Common thermal printer vendor IDs
        const thermalVendors = [
          { id: 0x0fe6, name: 'XPrinter' },
          { id: 0x04b8, name: 'Epson' },
          { id: 0x154f, name: 'SNBC' },
          { id: 0x0416, name: 'Gowell' },
          { id: 0x20d1, name: 'Star Micronics' },
          { id: 0x0519, name: 'Star' },
        ]
        
        const printerDevices = usbDevices.filter(device => {
          try {
            if (device.deviceDescriptor) {
              const desc = device.deviceDescriptor
              return thermalVendors.some(vendor => vendor.id === desc.idVendor)
            }
            return false
          } catch (err) {
            return false
          }
        })
        
        printerDevices.forEach((device) => {
          const desc = device.deviceDescriptor
          const vendor = thermalVendors.find(v => v.id === desc.idVendor)
          allPrinters.push({
            name: `${vendor?.name || 'USB'} Thermal (${desc.idVendor}:${desc.idProduct})`,
            path: `USB:${desc.idVendor}:${desc.idProduct}`,
            type: 'USB',
            manufacturer: vendor?.name || 'Thermal Printer',
            vendorId: desc.idVendor,
            productId: desc.idProduct
          })
        })
        
        console.log('[PRINTER] Impresoras térmicas USB encontradas:', printerDevices.length)
      } catch (usbError) {
        console.log('[PRINTER] No se detectaron impresoras USB térmicas:', usbError.message)
      }
      
      // 2. Detect Windows system printers using node-thermal-printer
      try {
        const printer = new ThermalPrinter({
          type: PrinterTypes.EPSON,
          interface: 'printer:Auto'
        })
        
        // Get Windows printers list
        const systemPrinters = await printer.getNetworkPrinters()
        console.log('[PRINTER] Impresoras del sistema encontradas:', systemPrinters.length)
        
        systemPrinters.forEach(p => {
          allPrinters.push({
            name: p,
            path: p,
            type: 'WINDOWS',
            manufacturer: 'Windows Printer',
            isDefault: false
          })
        })
      } catch (sysError) {
        console.log('[PRINTER] No se detectaron impresoras del sistema:', sysError.message)
      }
      
      console.log('[PRINTER] Total de impresoras detectadas:', allPrinters.length)
      return allPrinters
      
    } catch (error) {
      console.error('[PRINTER] Error al detectar impresoras:', error.message)
      return []
    }
  }

  async connectToPrinter(printerPath, baudRate = 9600) {
    try {
      // Close existing connection
      if (this.isConnected) {
        await this.disconnectPrinter()
      }

      console.log('[PRINTER] Conectando a:', printerPath)

      if (printerPath.startsWith('USB:')) {
        const [, vendorId, productId] = printerPath.split(':')
        
        const usbDevices = USB.getDeviceList()
        const targetDevice = usbDevices.find(d => 
          d.deviceDescriptor &&
          d.deviceDescriptor.idVendor === parseInt(vendorId) && 
          d.deviceDescriptor.idProduct === parseInt(productId)
        )

        if (!targetDevice) {
          throw new Error('Impresora USB no encontrada')
        }

        // Create USB adapter for escpos
        const adapter = new escpos.USB(parseInt(vendorId), parseInt(productId))
        this.device = adapter
        
        await new Promise((resolve, reject) => {
          adapter.open((error) => {
            if (error) {
              reject(error)
            } else {
              resolve()
            }
          })
        })

        this.printerType = 'USB'
        
      } else {
        this.thermalPrinter = new ThermalPrinter({
          type: PrinterTypes.EPSON,
          interface: `printer:${printerPath}`,
          characterSet: 'SLOVENIA',
          removeSpecialCharacters: false,
          lineCharacter: '-',
          options: {
            timeout: 5000
          }
        })

        // Test connection
        const isConnected = await this.thermalPrinter.isPrinterConnected()
        if (!isConnected) {
          throw new Error('No se pudo conectar a la impresora del sistema')
        }

        this.printerType = 'WINDOWS'
      }

      this.isConnected = true
      this.printerName = printerPath
      
      console.log('[PRINTER] Conectado exitosamente a:', printerPath, 'Tipo:', this.printerType)
      return true
      
    } catch (error) {
      console.error('[PRINTER] Error de conexión:', error.message)
      this.isConnected = false
      throw error
    }
  }

  async sendToPrinter(data) {
    if (!this.isConnected) {
      throw new Error('Impresora no conectada')
    }

    try {
      console.log('[PRINTER] Enviando a impresora, tamaño:', data.length, 'bytes, tipo:', this.printerType)

      if (this.printerType === 'WINDOWS') {
        // Convert ESC/POS commands to raw print
        const buffer = Buffer.from(data, 'binary')
        await this.thermalPrinter.raw(buffer)
        await this.thermalPrinter.execute()
        
        console.log('[PRINTER] Trabajo de impresión enviado exitosamente')
        return true
        
      } else {
        return new Promise((resolve, reject) => {
          const buffer = Buffer.from(data, 'binary')
          
          this.device.write(buffer, (error) => {
            if (error) {
              console.error('[PRINTER] Error de escritura USB:', error)
              reject(error)
            } else {
              console.log('[PRINTER] Datos enviados a impresora USB exitosamente')
              resolve(true)
            }
          })
        })
      }
      
    } catch (error) {
      console.error('[PRINTER] Error al enviar:', error.message)
      throw error
    }
  }

  async disconnectPrinter() {
    if (this.device && this.printerType === 'USB') {
      try {
        await new Promise((resolve) => {
          this.device.close(() => {
            console.log('[PRINTER] Dispositivo USB cerrado')
            resolve()
          })
        })
      } catch (error) {
        console.error('[PRINTER] Error al cerrar dispositivo:', error.message)
      }
    }
    
    this.device = null
    this.thermalPrinter = null
    this.isConnected = false
    this.printerType = null
    console.log('[PRINTER] Desconectado')
  }

  isConnectedToPrinter() {
    return this.isConnected
  }

  getStatus() {
    return {
      connected: this.isConnected,
      portName: this.printerName,
      type: this.printerType,
      config: this.printerConfig
    }
  }
}

export default new PrinterService()
