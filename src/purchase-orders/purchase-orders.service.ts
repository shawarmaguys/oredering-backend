import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { SendPurchaseOrderDto } from './dto/send-purchase-order.dto';
import { PurchaseOrderStatus } from '@prisma/client';
import { generatePurchaseOrderPdf } from '../common/utils/pdf.util';
import { decryptToken } from '../common/utils/crypto.util';
import { resolveChannelId, uploadPdfToSlackThread } from '../common/utils/slack.util';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPurchaseOrderDto: CreatePurchaseOrderDto, userId: string) {
    const { vendorId, locationId, stockRecordId, notes, items } = createPurchaseOrderDto;

    // Verify vendor
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) throw new NotFoundException(`Vendor with ID ${vendorId} not found`);

    // Verify location
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) throw new NotFoundException(`Location with ID ${locationId} not found`);

    // Verify stock record if provided
    if (stockRecordId) {
      const stockRecord = await this.prisma.stockRecord.findUnique({ where: { id: stockRecordId } });
      if (!stockRecord) throw new NotFoundException(`Stock record with ID ${stockRecordId} not found`);
    }

    if (items.length === 0) throw new BadRequestException('Purchase order must contain at least one item');

    // Look up user name to store as plain text in createdBy
    const creatorUser = await this.prisma.user.findUnique({ where: { id: userId } });
    const creatorName = creatorUser?.fullName || userId;

    return this.prisma.$transaction(async (tx) => {
      const po = await tx.purchaseOrder.create({
        data: { vendorId, locationId, stockRecordId, notes: notes ?? '', createdBy: creatorName, status: PurchaseOrderStatus.DRAFT },
      });

      // Batch-fetch all items to avoid N+1 queries inside the transaction
      const itemIds = items.map((i) => i.itemId);
      const dbItems = await tx.item.findMany({ where: { id: { in: itemIds } } });
      const dbItemMap = new Map(dbItems.map((item) => [item.id, item]));

      for (const itemDto of items) {
        if (!dbItemMap.has(itemDto.itemId)) {
          throw new NotFoundException(`Item with ID ${itemDto.itemId} not found`);
        }
      }

      await tx.purchaseOrderItem.createMany({
        data: items.map((itemDto) => ({
          purchaseOrderId: po.id,
          itemId: itemDto.itemId,
          quantity: itemDto.quantity,
          unitName: itemDto.unitName,
        })),
      });

      return tx.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { items: { include: { item: true } }, vendor: true, location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } } },
      });
    });
  }

  async findAll(user: any, status?: PurchaseOrderStatus, page = 1, limit = 25) {
    const where: any = {};
    if (status) where.status = status;

    if (user.role !== 'ADMIN') {
      const userLocs = await this.prisma.userLocation.findMany({ where: { userId: user.id } });
      where.locationId = { in: userLocs.map((ul) => ul.locationId) };
    }

    const skip = (page - 1) * limit;

    const [data, total] = await this.prisma.$transaction([
      this.prisma.purchaseOrder.findMany({
        where,
        select: {
          id: true,
          vendorId: true,
          vendor: { select: { id: true, displayName: true, email: true } },
          locationId: true,
          location: { select: { id: true, name: true } },
          stockRecordId: true,
          createdBy: true,
          approvedBy: true,
          status: true,
          notes: true,
          emailsSent: true,
          createdAt: true,
          approvedAt: true,
          approver: { select: { id: true, fullName: true, email: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { item: true } },
        vendor: true,
        location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        approver: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });

    if (!po) throw new NotFoundException(`Purchase order with ID ${id} not found`);
    return po;
  }

  async approve(id: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException(`Purchase order with ID ${id} not found`);
    if (po.status !== PurchaseOrderStatus.DRAFT) throw new BadRequestException(`Purchase order is already ${po.status}`);

    const updatedPo = await this.prisma.purchaseOrder.update({
      where: { id },
      data: { status: PurchaseOrderStatus.GENERATED, approvedBy: userId, approvedAt: new Date() },
      include: {
        items: { include: { item: true } },
        vendor: { include: { department: true } },
        location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        stockRecord: true,
        approver: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });

    // Post Slack Thread Reply if there's an associated stock record
    void (async () => {
      try {
        const loc = await this.prisma.location.findUnique({ where: { id: updatedPo.locationId } });
        const botToken = decryptToken(loc?.slackBotToken);
        const stockRecord = updatedPo.stockRecord;
        const user = await this.prisma.user.findUnique({ where: { id: userId } });

        if (botToken && stockRecord) {
          const deptChannel = updatedPo.vendor?.department?.slackChannel;
          if (stockRecord.responseSlackMessageTs && deptChannel) {
            try {
              const resolvedChannelId = await resolveChannelId(botToken, deptChannel);
              const pdfBuffer = await generatePurchaseOrderPdf(updatedPo);
              const safeLocationName = updatedPo.location.name.replace(/[^a-zA-Z0-9]/g, '_');
              const fileName = `PurchaseOrder_${safeLocationName}_${new Date().toISOString().split('T')[0]}.pdf`;
              const msg =
                `🛍️ *Purchase Order #${updatedPo.id.slice(0, 8)} Approved*\n` +
                `• *Status:* APPROVED\n` +
                `• *Approved By:* ${user?.fullName || 'System'}\n` +
                `• *Date:* ${new Date().toLocaleString()}\n\n` +
                `This purchase order has been approved. PDF attached.`;
              await uploadPdfToSlackThread(botToken, resolvedChannelId, stockRecord.responseSlackMessageTs, pdfBuffer, fileName, msg);
            } catch (err) {
              console.error('[Slack] Failed to send approval reply to department message:', err);
            }
          }
        }
      } catch (err) {
        console.error('[Slack] Failed to start approval reply task:', err);
      }
    })();

    return updatedPo;
  }

  async update(id: string, updatePurchaseOrderDto: UpdatePurchaseOrderDto) {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id } });
    if (!po) throw new NotFoundException(`Purchase order with ID ${id} not found`);
    if (po.status !== PurchaseOrderStatus.DRAFT) throw new BadRequestException('Can only update DRAFT purchase orders');

    return this.prisma.$transaction(
      async (tx) => {
        await Promise.all(
          updatePurchaseOrderDto.items.map((itemDto) => {
            const updateData: any = { quantity: itemDto.quantity };
            if (itemDto.displayUnitName !== undefined) {
              updateData.unitName = itemDto.displayUnitName;
            }
            return tx.purchaseOrderItem.updateMany({
              where: { purchaseOrderId: id, itemId: itemDto.itemId },
              data: updateData,
            });
          }),
        );

        return tx.purchaseOrder.findUnique({
          where: { id },
          include: {
            items: { include: { item: true } },
            vendor: true,
            location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
            approver: { select: { id: true, fullName: true, email: true, role: true } },
          },
        });
      },
      {
        timeout: 15000,
      },
    );
  }

  async send(id: string, sendPurchaseOrderDto: SendPurchaseOrderDto, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: { include: { item: true } },
        vendor: { include: { department: true } },
        location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        stockRecord: true,
        approver: { select: { id: true, fullName: true, email: true, role: true } },
      },
    });

    if (!po) throw new NotFoundException(`Purchase order with ID ${id} not found`);

    if (sendPurchaseOrderDto.notes !== undefined) {
      await this.prisma.purchaseOrder.update({ where: { id }, data: { notes: sendPurchaseOrderDto.notes } });
      po.notes = sendPurchaseOrderDto.notes;
    }

    const configuredEmailServiceUrl = process.env.EMAIL_SERVICE_URL;
    if (!configuredEmailServiceUrl) throw new BadRequestException('EMAIL_SERVICE is not configured');

    const emailsSentStr = sendPurchaseOrderDto.emails.join(', ');
    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.SENT,
        emailsSent: emailsSentStr,
      },
    });
    po.status = PurchaseOrderStatus.SENT;
    po.emailsSent = emailsSentStr;

    // Generate the PDF, send email, and post Slack replies in the background.
    void (async () => {
      try {
        const pdfBuffer = await generatePurchaseOrderPdf(po);
        const base64Content = pdfBuffer.toString('base64');
        const safeLocationName = po.location.name.replace(/[^a-zA-Z0-9]/g, '_');
        const fileName = `PurchaseOrder_${safeLocationName}_${new Date().toISOString().split('T')[0]}.pdf`;

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        const senderEmail = user?.email || 'admin@shawarmaguys.com';

        const poIdShort = po.id.slice(0, 8);
        const subject = sendPurchaseOrderDto.subject || `Purchase Order #${poIdShort} - Shawarma Guys (${po.location.name})`;

        const htmlBody = sendPurchaseOrderDto.body || `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h2 style="color: #10b981;">Shawarma Guys Purchase Order</h2>
            <p>Dear ${po.vendor?.displayName || 'Supplier'},</p>
            <p>Please find attached our official Purchase Order <strong>#${poIdShort}</strong> from <strong>Shawarma Guys - ${po.location.name}</strong>.</p>
            <p><strong>Order Details:</strong></p>
            <ul>
              <li><strong>Location:</strong> ${po.location.name}</li>
              <li><strong>Date:</strong> ${new Date(po.createdAt).toLocaleDateString()}</li>
              <li><strong>Generated By:</strong> ${po.createdBy || 'System'}</li>
            </ul>
            <p>Please confirm receipt of this order and coordinate delivery details with us.</p>
            <br/>
            <p>Best regards,</p>
            <p><strong>${user?.fullName || 'Inventory Manager'}</strong><br/>Shawarma Guys Team</p>
          </div>
        `;

        const payload = {
          to: sendPurchaseOrderDto.emails.join(','),
          subject,
          htmlBody,
          body: 'Please see the attached PDF purchase order.',
          replyTo: senderEmail,
          cc: senderEmail,
          attachments: [{ name: fileName, mimeType: 'application/pdf', content: base64Content }],
        };

        try {
          const response = await fetch(configuredEmailServiceUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          const responseText = await response.text();
          console.log('Google Script Email Response:', responseText);

          const loc = await this.prisma.location.findUnique({ where: { id: po.locationId } });
          const botToken = decryptToken(loc?.slackBotToken);
          const stockRecord = po.stockRecord;

          if (botToken && stockRecord) {
            const vendorChannel = po.vendor?.channelName;
            if (stockRecord.slackMessageTs && vendorChannel) {
              try {
                const resolvedChannelId = await resolveChannelId(botToken, vendorChannel);
                const msg =
                  `🛍️ *Purchase Order #${po.id.slice(0, 8)} Sent*\n` +
                  `• *Status:* SENT\n` +
                  `• *Sent By:* ${user?.fullName || 'System'}\n` +
                  `• *Date:* ${new Date().toLocaleString()}\n\n` +
                  `The official PDF Purchase Order sent to the supplier has been attached to this thread.`;
                await uploadPdfToSlackThread(botToken, resolvedChannelId, stockRecord.slackMessageTs, pdfBuffer, fileName, msg);
              } catch (err) {
                console.error('[Slack] Failed to send reply to trigger message:', err);
              }
            }

            const deptChannel = po.vendor?.department?.slackChannel;
            if (stockRecord.responseSlackMessageTs && deptChannel) {
              try {
                const resolvedChannelId = await resolveChannelId(botToken, deptChannel);
                const msg =
                  `🛍️ *Purchase Order #${po.id.slice(0, 8)} Approved & Sent*\n` +
                  `• *Status:* SENT\n` +
                  `• *Sent By:* ${user?.fullName || 'System'}\n` +
                  `• *Date:* ${new Date().toLocaleString()}\n\n` +
                  `This purchase order has been finalized and sent to the supplier. PDF attached.`;
                await uploadPdfToSlackThread(botToken, resolvedChannelId, stockRecord.responseSlackMessageTs, pdfBuffer, fileName, msg);
              } catch (err) {
                console.error('[Slack] Failed to send reply to department message:', err);
              }
            }
          }
        } catch (error: any) {
          console.error('Failed to send PO email via Google Script:', error);
        }
      } catch (error: any) {
        console.error('Failed to run queued PO send task:', error);
      }
    })();

    return { success: true, message: 'Purchase Order send queued.' };
  }
}
