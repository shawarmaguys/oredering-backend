import { Injectable, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTranslationDto } from './dto/create-translation.dto';

@Injectable()
export class TranslationsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const seedData = [
      // Headers & Role Descriptors
      { sourceText: 'Store Portal', translatedText: 'Portal de la Tienda', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Manager Portal', translatedText: 'Portal del Gerente', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Admin Dashboard', translatedText: 'Panel de Administración', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Kitchen Worker', translatedText: 'Trabajador de Cocina', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Inventory Manager', translatedText: 'Administrador de Inventario', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Administrator', translatedText: 'Administrador', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Log Out', translatedText: 'Cerrar Sesión', sourceLanguage: 'en', targetLanguage: 'es' },

      // Store Portal Phrases
      { sourceText: 'Record kitchen stock audits, view schedules, and submit daily physical quantities.', translatedText: 'Registre las auditorías de inventario de cocina, consulte horarios y envíe cantidades físicas diarias.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Active Store Location', translatedText: 'Ubicación Activa de la Tienda', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Filter pending audits and completed submissions for your kitchen.', translatedText: 'Filtre auditorías pendientes y envíos completados para su cocina.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Action Required', translatedText: 'Acción Requerida', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'All Caught Up!', translatedText: '¡Todo al día!', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Pending Stock Audit', translatedText: 'Auditoría de Inventario Pendiente', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Awaiting Count', translatedText: 'Esperando Conteo', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Start submission', translatedText: 'Iniciar envío', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Submitted Audit', translatedText: 'Auditoría Enviada', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Completed', translatedText: 'Completado', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'No stock take history logged for today yet.', translatedText: 'Aún no se ha registrado historial de inventario para hoy.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'No scheduled inventory counts are currently pending.', translatedText: 'No hay conteos programados pendientes de realizar.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'No locations assigned', translatedText: 'No hay ubicaciones asignadas', sourceLanguage: 'en', targetLanguage: 'es' },

      // Manager Dashboard Phrases
      { sourceText: 'Review worker inventory submissions, fix anomalies, and authorize purchase orders for distribution.', translatedText: 'Revise envíos de inventario, corrija anomalías y autorice órdenes de compra para su distribución.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Pending Approvals & Orders', translatedText: 'Aprobaciones y Órdenes Pendientes', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Review and send pending procurement orders to suppliers.', translatedText: 'Revise y envíe pedidos de adquisición pendientes a los proveedores.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Approved (Not Sent)', translatedText: 'Aprobado (No Enviado)', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Pending Review', translatedText: 'Pendiente de Revisión', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Send PO', translatedText: 'Enviar PO', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Review values', translatedText: 'Revisar valores', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Reports & Audits', translatedText: 'Reportes y Auditorías', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Access all completed kitchen stock sheets and track the stage of procurement purchase orders.', translatedText: 'Acceda a hojas de stock de cocina completadas y siga la etapa de las órdenes de compra.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'View Reports & Audits', translatedText: 'Ver Reportes y Auditorías', sourceLanguage: 'en', targetLanguage: 'es' },

      // Purchase Order Details Phrases
      { sourceText: 'PO Details', translatedText: 'Detalles de PO', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Back to Reports & Audits', translatedText: 'Volver a Reportes y Auditorías', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Official Purchase Order', translatedText: 'Orden de Compra Oficial', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Metadata & Procurement Scope', translatedText: 'Metadatos y Alcance de Adquisición', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Vendor / Supplier', translatedText: 'Proveedor / Vendedor', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Location / Branch', translatedText: 'Ubicación / Sucursal', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Current Stage', translatedText: 'Etapa Actual', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Ordered Items Breakdown', translatedText: 'Desglose de Artículos Ordenados', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'No items in this purchase order.', translatedText: 'No hay artículos en esta orden de compra.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Unit', translatedText: 'Unidad', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Counted', translatedText: 'Contado', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Normalized (Cases)', translatedText: 'Normalizado (Cajas)', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Par (Cases)', translatedText: 'Par (Cajas)', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Suggested PO (Cases)', translatedText: 'PO Sugerido (Cajas)', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Order Qty', translatedText: 'Cant. Pedido', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Ordered Qty', translatedText: 'Cant. Ordenada', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Save Draft Changes', translatedText: 'Guardar Cambios de Borrador', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Approve Purchase Order', translatedText: 'Aprobar Orden de Compra', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Already approved by', translatedText: 'Ya aprobado por', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Email Order to Supplier', translatedText: 'Enviar Pedido por Correo al Proveedor', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'View Order PDF', translatedText: 'Ver PDF de Orden', sourceLanguage: 'en', targetLanguage: 'es' },

      // Email Modal Phrases
      { sourceText: 'Email Purchase Order', translatedText: 'Enviar Orden de Compra por Correo', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Send official PDF purchase order to', translatedText: 'Enviar orden de compra oficial en PDF a', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Recipient Email(s)', translatedText: 'Correo(s) del Destinatario', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Separate multiple recipient emails with commas.', translatedText: 'Separe múltiples correos de destinatarios con comas.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Fixed Email Subject', translatedText: 'Asunto de Correo Electrónico Fijo', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Purchase Order Note / Dispatch Instructions', translatedText: 'Nota de Orden de Compra / Instrucciones de Envío', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'This note is saved to the database and hardcoded into the final PDF.', translatedText: 'Esta nota se guarda en la base de datos y se incluye en el PDF final.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Cancel', translatedText: 'Cancelar', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Send Purchase Order', translatedText: 'Enviar Orden de Compra', sourceLanguage: 'en', targetLanguage: 'es' },

      // Side Navigation Menu
      { sourceText: 'Dashboard', translatedText: 'Panel', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Locations', translatedText: 'Ubicaciones', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Vendors', translatedText: 'Proveedores', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Items', translatedText: 'Productos', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Users', translatedText: 'Usuarios', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Reports', translatedText: 'Reportes', sourceLanguage: 'en', targetLanguage: 'es' },

      // Dynamic & New Operational Phrases
      { sourceText: 'You have', translatedText: 'Tiene', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'pending inventory count(s) to complete today.', translatedText: 'conteo(s) de inventario pendiente(s) para completar hoy.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'PO', translatedText: 'PO', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'PO ID', translatedText: 'ID de PO', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Supplier Wholesaler', translatedText: 'Proveedor Mayorista', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Supplier', translatedText: 'Proveedor', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'at', translatedText: 'en', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Action Needed', translatedText: 'Acción Requerida', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Saving...', translatedText: 'Guardando...', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Approving...', translatedText: 'Aprobando...', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Sending...', translatedText: 'Enviando...', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Purchase Order Approved!', translatedText: '¡Orden de Compra Aprobada!', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'The purchase order for', translatedText: 'La orden de compra para', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'has been successfully authorized and moved to generated status.', translatedText: 'ha sido autorizada con éxito y cambiada al estado generado.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Would you like to send it to the supplier via email now?', translatedText: '¿Le gustaría enviarla al proveedor por correo electrónico ahora?', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'No, Later', translatedText: 'No, más tarde', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Yes, Send Now', translatedText: 'Sí, enviar ahora', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Approve Purchase Order?', translatedText: '¿Aprobar Orden de Compra?', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Are you sure you want to approve this purchase order for', translatedText: '¿Está seguro de que desea aprobar esta orden de compra para', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Enter dispatch times, delivery notes, or instructions. This note will appear inside the generated PDF purchase order.', translatedText: 'Ingrese horarios de entrega, notas o instrucciones. Esta nota aparecerá dentro de la orden de compra en PDF.', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Date', translatedText: 'Fecha', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Location', translatedText: 'Ubicación', sourceLanguage: 'en', targetLanguage: 'es' },
      { sourceText: 'Item', translatedText: 'Producto', sourceLanguage: 'en', targetLanguage: 'es' }
    ];

    for (const item of seedData) {
      const existing = await this.prisma.translation.findFirst({
        where: {
          sourceText: item.sourceText,
          targetLanguage: item.targetLanguage,
        },
      });
      if (!existing) {
        await this.prisma.translation.create({
          data: item,
        });
      }
    }
  }

  async create(createTranslationDto: CreateTranslationDto) {
    return this.prisma.translation.create({
      data: createTranslationDto,
    });
  }

  async findAll() {
    return this.prisma.translation.findMany({
      orderBy: { id: 'asc' },
    });
  }
}
