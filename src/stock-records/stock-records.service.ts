import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockRecordDto } from './dto/create-stock-record.dto';
import { CompleteStockRecordDto } from './dto/complete-stock-record.dto';
import { decryptToken } from '../common/utils/crypto.util';
import { generateStockRecordPdf } from '../common/utils/pdf.util';

@Injectable()
export class StockRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(createStockRecordDto: CreateStockRecordDto, userId: string | null) {
    const { locationId, items } = createStockRecordDto;

    // Check location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    if (items.length === 0) {
      throw new BadRequestException('Stock record must contain at least one item');
    }

    // Process items in a transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Create Stock Record
      const stockRecord = await tx.stockRecord.create({
        data: {
          locationId,
          submittedBy: userId,
          submittedAt: new Date(),
        },
      });

      // 2. Fetch all items to compute normalized quantities
      const itemIds = items.map((i) => i.itemId);
      const dbItems = await tx.item.findMany({
        where: { id: { in: itemIds } },
      });

      const dbItemMap = new Map(dbItems.map((item) => [item.id, item]));

      // 3. Create Stock Record Items
      for (const itemDto of items) {
        const dbItem = dbItemMap.get(itemDto.itemId);
        if (!dbItem) {
          throw new NotFoundException(`Item with ID ${itemDto.itemId} not found`);
        }

        await tx.stockRecordItem.create({
          data: {
            stockRecordId: stockRecord.id,
            itemId: itemDto.itemId,
            basicQuantity: itemDto.basicQuantity || 0,
            secondaryQuantity: itemDto.secondaryQuantity || 0,
            frontBasicQuantity: itemDto.frontBasicQuantity || 0,
            frontSecondaryQuantity: itemDto.frontSecondaryQuantity || 0,
          },
        });
      }

      // Fetch complete record to return
      return tx.stockRecord.findUnique({
        where: { id: stockRecord.id },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          submitter: {
            select: {
              id: true,
              fullName: true,
              email: true,
              role: true,
            },
          },
          location: true,
        },
      });
    });
  }

  async findAll(user: any) {
    const where: any = {};

    if (user.role !== 'ADMIN') {
      const userLocs = await this.prisma.userLocation.findMany({
        where: { userId: user.id },
      });
      const locationIds = userLocs.map((ul) => ul.locationId);
      where.locationId = { in: locationIds };
    }

    return this.prisma.stockRecord.findMany({
      where,
      include: {
        items: {
          include: {
            item: true,
          },
        },
        submitter: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        location: true,
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const record = await this.prisma.stockRecord.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        submitter: {
          select: {
            id: true,
            fullName: true,
            email: true,
            role: true,
          },
        },
        location: true,
      },
    });

    if (!record) {
      throw new NotFoundException(`Stock record with ID ${id} not found`);
    }

    return record;
  }

  async complete(id: string, completeDto: CompleteStockRecordDto, userId: string | null) {
    const record = await this.prisma.stockRecord.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Stock record with ID ${id} not found`);
    }

    // Resolve effective user ID - fall back to admin when called unauthenticated
    let effectiveUserId = userId;
    if (!effectiveUserId) {
      const fallbackUser =
        (await this.prisma.user.findFirst({ where: { role: 'ADMIN' } })) ||
        (await this.prisma.user.findFirst());
      effectiveUserId = fallbackUser?.id ?? null;
    }

    // Removed the check that prevented editing an already completed record


    const { items } = completeDto;
    const submittedByName = completeDto.submitterName?.trim() || undefined;
    if (items.length === 0) {
      throw new BadRequestException('Stock record must contain at least one item');
    }

    const completedRecord = await this.prisma.$transaction(async (tx) => {
      // 1. Delete existing placeholder items
      await tx.stockRecordItem.deleteMany({
        where: { stockRecordId: id },
      });

      // 2. Fetch all items to compute normalized quantities
      const itemIds = items.map((i) => i.itemId);
      const dbItems = await tx.item.findMany({
        where: { id: { in: itemIds } },
      });

      const dbItemMap = new Map(dbItems.map((item) => [item.id, item]));

      // 3. Create Stock Record Items
      for (const itemDto of items) {
        const dbItem = dbItemMap.get(itemDto.itemId);
        if (!dbItem) {
          throw new NotFoundException(`Item with ID ${itemDto.itemId} not found`);
        }

        await tx.stockRecordItem.create({
          data: {
            stockRecordId: id,
            itemId: itemDto.itemId,
            basicQuantity: itemDto.basicQuantity || 0,
            secondaryQuantity: itemDto.secondaryQuantity || 0,
            frontBasicQuantity: itemDto.frontBasicQuantity || 0,
            frontSecondaryQuantity: itemDto.frontSecondaryQuantity || 0,
          },
        });
      }

      // 4. Update Stock Record to complete
      return tx.stockRecord.update({
        where: { id },
        data: {
          isCompleted: true,
          submittedBy: userId,
          submittedAt: new Date(),
        },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          submitter: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          location: true,
        },
      });
    });

    // 5. Generate and send PDF/Slack notifications in the background.
    void (async () => {
    try {
      const fullRecord = await this.prisma.stockRecord.findUnique({
        where: { id },
        include: {
          items: {
            include: {
              item: {
                include: {
                  vendor: {
                    include: {
                      department: true,
                    },
                  },
                },
              },
            },
          },
          submitter: {
            select: { id: true, fullName: true, email: true, role: true },
          },
          location: true,
        },
      });

      if (fullRecord) {
        const firstItem = fullRecord.items?.[0]?.item;
        const vendor = firstItem?.vendor;
        const department = vendor?.department;
        const vendorName = vendor?.displayName || 'Unknown Vendor';

        let createdPoId: string | null = null;

        // If a purchase order doesn't already exist for this stock record, draft one
        if (vendor) {
          const existingPo = await this.prisma.purchaseOrder.findFirst({
            where: { stockRecordId: id },
          });

          if (!existingPo) {
            // Find all location items to get their parLevels
            const locationItems = await this.prisma.locationItem.findMany({
              where: {
                locationId: fullRecord.locationId,
                itemId: { in: fullRecord.items.map((ri) => ri.itemId) },
              },
            });
            const parMap = new Map(locationItems.map((li) => [li.itemId, Number(li.parLevel) || 0]));

            // Calculate PO items
            // Calculate PO items
            const poItemsToCreate: Array<{
              itemId: string;
              quantity: number;
              unitName: string;
              basicQuantity: number;
              secondaryQuantity: number;
              normalizedQuantity: number;
              parLevel: number;
              suggestedQuantity: number;
            }> = [];

            for (const ri of fullRecord.items) {
              const item = ri.item;
              const parLevel = parMap.get(ri.itemId) || 0;
              const multiplier = Number(item.multiplier) || 1;

              const basicQty = Number(ri.basicQuantity) || 0;
              const secondaryQty = Number(ri.secondaryQuantity) || 0;
              const frontBasicQty = Number(ri.frontBasicQuantity) || 0;
              const frontSecondaryQty = Number(ri.frontSecondaryQuantity) || 0;

              const totalBasic = basicQty + frontBasicQty;
              const totalSec = secondaryQty + frontSecondaryQty;
              const countedQty = totalSec + (totalBasic / multiplier);

              const roundedNormalized = Math.round(countedQty);
              const roundedPar = Math.round(parLevel);
              const suggestedQty = Math.max(0, roundedPar - roundedNormalized);

              poItemsToCreate.push({
                itemId: ri.itemId,
                quantity: suggestedQty,
                unitName: item.displayUnitName || 'pcs',
                basicQuantity: totalBasic,
                secondaryQuantity: totalSec,
                normalizedQuantity: roundedNormalized,
                parLevel: roundedPar,
                suggestedQuantity: suggestedQty,
              });
            }

            // Create Draft PO
            const po = await this.prisma.purchaseOrder.create({
              data: {
                vendorId: vendor.id,
                locationId: fullRecord.locationId,
                stockRecordId: id,
                createdBy: effectiveUserId as string,
                status: 'DRAFT',
                notes: `Auto-drafted from Stock Audit Count #${id.slice(0, 8)}`,
                items: {
                  create: poItemsToCreate,
                },
              },
            });
            createdPoId = po.id;
          } else {
            createdPoId = existingPo.id;
          }
        }

        const botToken = decryptToken(fullRecord.location?.slackBotToken);
        const slackChannel = department?.slackChannel;

        if (botToken && slackChannel) {
          const resolvedChannelId = await resolveChannelId(botToken, slackChannel);

          const pdfBuffer = await generateStockRecordPdf({
            ...fullRecord,
            vendorName,
            submittedByName,
          });

          const safeLocationName = fullRecord.location.name.replace(/[^a-zA-Z0-9]/g, '_');
          const fileName = `StockAudit_${safeLocationName}_${new Date().toISOString().split('T')[0]}.pdf`;

          let message = `📄 *Stock Count Audit Submitted*\n` +
            `• *Location:* ${fullRecord.location.name}\n` +
            `• *Vendor:* ${vendorName}\n` +
            `• *Department:* ${department?.fullName || 'N/A'}\n` +
            `• *Submitted By:* ${submittedByName || fullRecord.submitter?.fullName || 'System'}\n` +
            `• *Date:* ${new Date(fullRecord.submittedAt).toLocaleString()}\n\n`;

          if (createdPoId) {
            const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
            message += `🛍️ *Auto-Drafted Purchase Order Created*\n` +
              `• *Status:* DRAFT\n` +
              `• *Review Link:* <${frontendUrl}/dashboard/admin/reports?poId=${createdPoId}|Review & Approve Purchase Order (Managers/Admins Only)>\n\n`;
          }

          message += `Please find the detailed PDF report attached below.`;

          // Send the message text first to get the ts
          const postMsgResponse = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${botToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              channel: resolvedChannelId,
              text: message,
            }),
          });

          const postMsgResult: any = await postMsgResponse.json();
          if (postMsgResult.ok && postMsgResult.ts) {
            const responseSlackMessageTs = postMsgResult.ts;

            // Save ts to database
            await this.prisma.stockRecord.update({
              where: { id },
              data: { responseSlackMessageTs },
            });
            completedRecord.responseSlackMessageTs = responseSlackMessageTs;

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
            if (getUrlResult.ok) {
              const { upload_url, file_id } = getUrlResult;

              // Step 2: Upload file contents directly (raw binary body)
              const uploadFileResponse = await fetch(upload_url, {
                method: 'POST',
                body: new Uint8Array(pdfBuffer),
              });

              if (uploadFileResponse.ok) {
                // Step 3: Complete the file upload and share with the thread
                const completeResponse = await fetch('https://slack.com/api/files.completeUploadExternal', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${botToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    files: [{ id: file_id, title: fileName }],
                    channel_id: resolvedChannelId,
                    thread_ts: responseSlackMessageTs,
                  }),
                });

                const completeResult: any = await completeResponse.json();
                if (!completeResult.ok) {
                  console.error('[Slack] completeUploadExternal failed:', completeResult.error);
                }
              } else {
                console.error('[Slack] External binary upload failed with status:', uploadFileResponse.status);
              }
            } else {
              console.error('[Slack] getUploadURLExternal failed:', getUrlResult.error);
            }
          } else {
            console.error('[Slack] chat.postMessage failed:', postMsgResult.error);
          }

          // In addition, if this stock record was triggered by a schedule and has a slackMessageTs, send the PDF as a threaded reply to the trigger message.
          const vendorChannel = vendor?.channelName;
          if (fullRecord.slackMessageTs && vendorChannel) {
            try {
              const resolvedVendorChannelId = await resolveChannelId(botToken, vendorChannel);
              const triggerReplyMessage = `✅ *Stock Count Completed & Submitted*\n` +
                `• *Submitted By:* ${submittedByName || fullRecord.submitter?.fullName || 'System'}\n` +
                `• *Date:* ${new Date(fullRecord.submittedAt).toLocaleString()}\n\n` +
                `The detailed stock count audit report has been attached to this thread.`;

              // Step 1: Get upload URL and file ID for the reply
              const urlEncodedBodyReply = new URLSearchParams();
              urlEncodedBodyReply.append('filename', fileName);
              urlEncodedBodyReply.append('length', pdfBuffer.length.toString());

              const getUrlResponseReply = await fetch('https://slack.com/api/files.getUploadURLExternal', {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${botToken}`,
                  'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: urlEncodedBodyReply.toString(),
              });

              const getUrlResultReply: any = await getUrlResponseReply.json();
              if (getUrlResultReply.ok) {
                const { upload_url: uploadUrlReply, file_id: fileIdReply } = getUrlResultReply;

                const uploadFileResponseReply = await fetch(uploadUrlReply, {
                  method: 'POST',
                  body: new Uint8Array(pdfBuffer),
                });

                if (uploadFileResponseReply.ok) {
                  const completeResponseReply = await fetch('https://slack.com/api/files.completeUploadExternal', {
                    method: 'POST',
                    headers: {
                      Authorization: `Bearer ${botToken}`,
                      'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                      files: [{ id: fileIdReply, title: fileName }],
                      channel_id: resolvedVendorChannelId,
                      thread_ts: fullRecord.slackMessageTs,
                      initial_comment: triggerReplyMessage,
                    }),
                  });
                  const completeResultReply: any = await completeResponseReply.json();
                  if (!completeResultReply.ok) {
                    console.error('[Slack] completeUploadExternal for trigger reply failed:', completeResultReply.error);
                  }
                } else {
                  console.error('[Slack] Binary upload for trigger reply failed with status:', uploadFileResponseReply.status);
                }
              } else {
                console.error('[Slack] getUploadURLExternal for trigger reply failed:', getUrlResultReply.error);
              }
            } catch (err) {
              console.error('[Slack] Error sending trigger notification reply:', err);
            }
          }
        }
      }
    } catch (slackErr) {
      console.error('[Slack] Error in PDF generation/upload:', slackErr);
    }
    })();

    return completedRecord;
  }
}

async function resolveChannelId(botToken: string, channelNameOrId: string): Promise<string> {
  const cleanName = channelNameOrId.replace(/^#/, '').trim();

  // If it already looks like a Channel ID (e.g., starts with C, G, D), return it directly
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

  // Fallback to the original value if not found
  return channelNameOrId;
}
