import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { SendPurchaseOrderDto } from './dto/send-purchase-order.dto';
import { PurchaseOrderStatus } from '@prisma/client';
import { generatePurchaseOrderPdf } from '../common/utils/pdf.util';
import { decryptToken } from '../common/utils/crypto.util';

@Injectable()
export class PurchaseOrdersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createPurchaseOrderDto: CreatePurchaseOrderDto, userId: string) {
    const { vendorId, locationId, stockRecordId, notes, items } = createPurchaseOrderDto;

    // Verify vendor
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
    }

    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Verify stock record if provided
    if (stockRecordId) {
      const stockRecord = await this.prisma.stockRecord.findUnique({
        where: { id: stockRecordId },
      });
      if (!stockRecord) {
        throw new NotFoundException(`Stock record with ID ${stockRecordId} not found`);
      }
    }

    if (items.length === 0) {
      throw new BadRequestException('Purchase order must contain at least one item');
    }

    return this.prisma.$transaction(async (tx) => {
      // Create PO
      const po = await tx.purchaseOrder.create({
        data: {
          vendorId,
          locationId,
          stockRecordId,
          notes,
          createdBy: userId,
          status: PurchaseOrderStatus.DRAFT,
        },
      });

      // Create PO items
      for (const itemDto of items) {
        const item = await tx.item.findUnique({
          where: { id: itemDto.itemId },
        });
        if (!item) {
          throw new NotFoundException(`Item with ID ${itemDto.itemId} not found`);
        }

        await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: po.id,
            itemId: itemDto.itemId,
            quantity: itemDto.quantity,
            unitName: itemDto.unitName,
          },
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id: po.id },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          vendor: true,
          location: true,
          creator: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      });
    });
  }

  async findAll(user: any, status?: PurchaseOrderStatus) {
    const where: any = {};
    if (status) {
      where.status = status;
    }

    if (user.role !== 'ADMIN') {
      const userLocs = await this.prisma.userLocation.findMany({
        where: { userId: user.id },
      });
      const locationIds = userLocs.map((ul) => ul.locationId);
      where.locationId = { in: locationIds };
    }

    return this.prisma.purchaseOrder.findMany({
      where,
      include: {
        items: {
          include: {
            item: true,
          },
        },
        vendor: true,
        location: true,
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        vendor: true,
        location: true,
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    return po;
  }

  async approve(id: string, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException(`Purchase order is already ${po.status}`);
    }

    const updatedPo = await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.GENERATED,
        approvedBy: userId,
        approvedAt: new Date(),
      },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        vendor: {
          include: {
            department: true,
          },
        },
        location: true,
        stockRecord: true,
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    // Post Slack Thread Reply if there's an associated stock record
    void (async () => {
      try {
    const botToken = decryptToken(updatedPo.location?.slackBotToken);
    const stockRecord = updatedPo.stockRecord;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (botToken && stockRecord) {
      const deptChannel = updatedPo.vendor?.department?.slackChannel;
      if (stockRecord.responseSlackMessageTs && deptChannel) {
        try {
          const resolvedChannelId = await resolveChannelId(botToken, deptChannel);
          const pdfBuffer = await generatePurchaseOrderPdf(updatedPo);
          const safeLocationName = updatedPo.location.name.replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = `PurchaseOrder_${safeLocationName}_${new Date().toISOString().split('T')[0]}.pdf`;

          const msg = `🛍️ *Purchase Order #${updatedPo.id.slice(0, 8)} Approved*\n` +
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
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (po.status !== PurchaseOrderStatus.DRAFT) {
      throw new BadRequestException('Can only update DRAFT purchase orders');
    }

    return this.prisma.$transaction(async (tx) => {
      // Update each item quantity
      for (const itemDto of updatePurchaseOrderDto.items) {
        await tx.purchaseOrderItem.updateMany({
          where: {
            purchaseOrderId: id,
            itemId: itemDto.itemId,
          },
          data: {
            quantity: itemDto.quantity,
          },
        });
      }

      return tx.purchaseOrder.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          vendor: true,
          location: true,
          creator: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          approver: {
            select: { id: true, fullName: true, email: true, role: true },
          },
        },
      });
    });
  }

  async send(id: string, sendPurchaseOrderDto: SendPurchaseOrderDto, userId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        vendor: {
          include: {
            department: true,
          },
        },
        location: true,
        stockRecord: true,
        creator: {
          select: { id: true, fullName: true, email: true, role: true },
        },
        approver: {
          select: { id: true, fullName: true, email: true, role: true },
        },
      },
    });

    if (!po) {
      throw new NotFoundException(`Purchase order with ID ${id} not found`);
    }

    if (sendPurchaseOrderDto.notes !== undefined) {
      await this.prisma.purchaseOrder.update({
        where: { id },
        data: { notes: sendPurchaseOrderDto.notes },
      });
      po.notes = sendPurchaseOrderDto.notes;
    }

    const configuredEmailServiceUrl = process.env.EMAIL_SERVICE_URL;
    if (!configuredEmailServiceUrl) {
      throw new BadRequestException('EMAIL_SERVICE is not configured');
    }

    await this.prisma.purchaseOrder.update({
      where: { id },
      data: {
        status: PurchaseOrderStatus.SENT,
      },
    });
    po.status = PurchaseOrderStatus.SENT;

    // Generate the PDF, send email, and post Slack replies in the background.
    void (async () => {
      try {

    // 1. Generate the purchase order PDF buffer
    const pdfBuffer = await generatePurchaseOrderPdf(po);

    // 2. Prepare payload details
    const base64Content = pdfBuffer.toString('base64');
    const safeLocationName = po.location.name.replace(/[^a-zA-Z0-9]/g, '_');
    const fileName = `PurchaseOrder_${safeLocationName}_${new Date().toISOString().split('T')[0]}.pdf`;

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const senderEmail = user?.email || po.creator?.email || 'admin@shawarmaguys.com';

    // 3. Construct Subject & Body
    const poIdShort = po.id.slice(0, 8);
    const subject = sendPurchaseOrderDto.subject || `Purchase Order #${poIdShort} - Shawarma Guys (${po.location.name})`;
    
    let htmlBody = sendPurchaseOrderDto.body || `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <h2 style="color: #10b981;">Shawarma Guys Purchase Order</h2>
        <p>Dear ${po.vendor?.displayName || 'Supplier'},</p>
        <p>Please find attached our official Purchase Order <strong>#${poIdShort}</strong> from <strong>Shawarma Guys - ${po.location.name}</strong>.</p>
        <p><strong>Order Details:</strong></p>
        <ul>
          <li><strong>Location:</strong> ${po.location.name}</li>
          <li><strong>Date:</strong> ${new Date(po.createdAt).toLocaleDateString()}</li>
          <li><strong>Generated By:</strong> ${po.creator?.fullName || 'System'}</li>
        </ul>
        <p>Please confirm receipt of this order and coordinate delivery details with us.</p>
        <br/>
        <p>Best regards,</p>
        <p><strong>${user?.fullName || 'Inventory Manager'}</strong><br/>Shawarma Guys Team</p>
      </div>
    `;

    // 4. Send to Google Apps Script Endpoint
    const targetEmails = sendPurchaseOrderDto.emails.join(',');
    const payload = {
      to: targetEmails,
      subject: subject,
      htmlBody: htmlBody,
      body: 'Please see the attached PDF purchase order.',
      replyTo: senderEmail,
      cc: senderEmail,
      attachments: [
        {
          name: fileName,
          mimeType: 'application/pdf',
          content: base64Content,
        },
      ],
    };

    const scriptUrl = configuredEmailServiceUrl;
    if (!scriptUrl) {
      throw new BadRequestException('EMAIL_SERVICE is not configured');
    }
    
    try {
      const response = await fetch(scriptUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const responseText = await response.text();
      console.log('Google Script Email Response:', responseText);

      // 5. Post Slack Thread Replies if there's an associated stock record
      const botToken = decryptToken(po.location?.slackBotToken);
      const stockRecord = po.stockRecord;

      if (botToken && stockRecord) {
        // Reply 1: To the trigger notification message (in vendor's channelName)
        const vendorChannel = po.vendor?.channelName;
        if (stockRecord.slackMessageTs && vendorChannel) {
          try {
            const resolvedChannelId = await resolveChannelId(botToken, vendorChannel);
            const msg = `🛍️ *Purchase Order #${po.id.slice(0, 8)} Sent*\n` +
              `• *Status:* SENT\n` +
              `• *Sent By:* ${user?.fullName || 'System'}\n` +
              `• *Date:* ${new Date().toLocaleString()}\n\n` +
              `The official PDF Purchase Order sent to the supplier has been attached to this thread.`;

            await uploadPdfToSlackThread(botToken, resolvedChannelId, stockRecord.slackMessageTs, pdfBuffer, fileName, msg);
          } catch (err) {
            console.error('[Slack] Failed to send reply to trigger message:', err);
          }
        }

        // Reply 2: To the department review request message (in department's slackChannel)
        const deptChannel = po.vendor?.department?.slackChannel;
        if (stockRecord.responseSlackMessageTs && deptChannel) {
          try {
            const resolvedChannelId = await resolveChannelId(botToken, deptChannel);
            const msg = `🛍️ *Purchase Order #${po.id.slice(0, 8)} Approved & Sent*\n` +
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

      return { success: true, message: 'Purchase Order sent successfully!', detail: responseText };
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

async function uploadPdfToSlackThread(
  botToken: string,
  channelId: string,
  threadTs: string,
  pdfBuffer: Buffer,
  fileName: string,
  message: string,
): Promise<any> {
  // Step 1: Get upload URL and file ID
  const urlEncodedBody = new URLSearchParams();
  urlEncodedBody.append('filename', fileName);
  urlEncodedBody.append('length', pdfBuffer.length.toString());

  const getUrlResponse = await fetch('https://slack.com/api/files.getUploadURLExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: urlEncodedBody.toString(),
  });

  const getUrlResult: any = await getUrlResponse.json();
  if (!getUrlResult.ok) {
    throw new Error(`getUploadURLExternal failed: ${getUrlResult.error}`);
  }

  const { upload_url, file_id } = getUrlResult;

  // Step 2: Upload file contents directly
  const uploadFileResponse = await fetch(upload_url, {
    method: 'POST',
    body: new Uint8Array(pdfBuffer),
  });

  if (!uploadFileResponse.ok) {
    throw new Error(`Binary upload failed with status: ${uploadFileResponse.status}`);
  }

  // Step 3: Complete the file upload and share with thread
  const completeResponse = await fetch('https://slack.com/api/files.completeUploadExternal', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      files: [{ id: file_id, title: fileName }],
      channel_id: channelId,
      thread_ts: threadTs,
      initial_comment: message,
    }),
  });

  const completeResult: any = await completeResponse.json();
  if (!completeResult.ok) {
    throw new Error(`completeUploadExternal failed: ${completeResult.error}`);
  }

  return completeResult;
}

async function resolveChannelId(botToken: string, channelNameOrId: string): Promise<string> {
  const cleanName = channelNameOrId.replace(/^#/, '').trim();

  if (/^[CGD][A-Z0-9]{8,}$/i.test(cleanName)) {
    return cleanName;
  }

  try {
    let cursor: string | undefined = undefined;
    do {
      const url = new URL('https://slack.com/api/conversations.list');
      url.searchParams.append('types', 'public_channel,private_channel');
      url.searchParams.append('limit', '200');
      if (cursor) {
        url.searchParams.append('cursor', cursor);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${botToken}`,
        },
      });

      const result: any = await response.json();
      if (!result.ok) {
        console.error('[Slack] conversations.list failed:', result.error);
        break;
      }

      const channels = result.channels || [];
      const found = channels.find(
        (c: any) => c.name.toLowerCase() === cleanName.toLowerCase()
      );
      if (found) {
        return found.id;
      }

      cursor = result.response_metadata?.next_cursor;
    } while (cursor);
  } catch (err) {
    console.error('[Slack] Error in resolveChannelId:', err);
  }

  return channelNameOrId;
}
