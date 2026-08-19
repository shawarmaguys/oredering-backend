import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStockRecordDto } from './dto/create-stock-record.dto';
import { CompleteStockRecordDto } from './dto/complete-stock-record.dto';
import { decryptToken } from '../common/utils/crypto.util';
import { generateStockRecordPdf } from '../common/utils/pdf.util';
import { resolveChannelId, uploadPdfToSlackThread } from '../common/utils/slack.util';

@Injectable()
export class StockRecordsService {
  private readonly logger = new Logger(StockRecordsService.name);

  constructor(private readonly prisma: PrismaService) { }

  async create(
    createStockRecordDto: CreateStockRecordDto,
    userId: string | null,
  ) {
    const { locationId, items } = createStockRecordDto;

    // Check location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    if (items.length === 0) {
      throw new BadRequestException(
        'Stock record must contain at least one item',
      );
    }

    // Process items in a transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Create Stock Record
      const stockRecord = await tx.stockRecord.create({
        data: {
          locationId,
          submittedBy: null,
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
        if (!dbItemMap.get(itemDto.itemId)) {
          throw new NotFoundException(
            `Item with ID ${itemDto.itemId} not found`,
          );
        }
      }

      await tx.stockRecordItem.createMany({
        data: items.map((itemDto) => ({
          stockRecordId: stockRecord.id,
          itemId: itemDto.itemId,
          basicQuantity: itemDto.basicQuantity || 0,
          secondaryQuantity: itemDto.secondaryQuantity || 0,
          frontBasicQuantity: itemDto.frontBasicQuantity || 0,
          frontSecondaryQuantity: itemDto.frontSecondaryQuantity || 0,
        })),
      });

      // Fetch complete record to return
      return tx.stockRecord.findUnique({
        where: { id: stockRecord.id },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        },
      });
    });
  }

  async findAll(user: any, page = 1, limit = 25) {
    const where: any = {};
    const skip = (page - 1) * limit;

    if (user.role !== 'ADMIN') {
      const userLocs = await this.prisma.userLocation.findMany({
        where: { userId: user.id },
      });
      const locationIds = userLocs.map((ul) => ul.locationId);
      where.locationId = { in: locationIds };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.stockRecord.findMany({
        where,
        include: {
          location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        },
        orderBy: { submittedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.stockRecord.count({ where }),
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
    const record = await this.prisma.stockRecord.findUnique({
      where: { id },
      include: {
        items: {
          include: {
            item: true,
          },
        },
        location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
      },
    });

    if (!record) {
      throw new NotFoundException(`Stock record with ID ${id} not found`);
    }

    return record;
  }

  async complete(id: string, completeDto: CompleteStockRecordDto) {
    const record = await this.prisma.stockRecord.findUnique({
      where: { id },
    });

    if (!record) {
      throw new NotFoundException(`Stock record with ID ${id} not found`);
    }
    const { items } = completeDto;
    const submittedByName = completeDto.submitterName?.trim() || 'no-user';
    if (items.length === 0) {
      throw new BadRequestException(
        'Stock record must contain at least one item',
      );
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
        if (!dbItemMap.has(itemDto.itemId)) {
          throw new NotFoundException(
            `Item with ID ${itemDto.itemId} not found`,
          );
        }
      }

      await tx.stockRecordItem.createMany({
        data: items.map((itemDto) => ({
          stockRecordId: id,
          itemId: itemDto.itemId,
          basicQuantity: itemDto.basicQuantity || 0,
          secondaryQuantity: itemDto.secondaryQuantity || 0,
          frontBasicQuantity: itemDto.frontBasicQuantity || 0,
          frontSecondaryQuantity: itemDto.frontSecondaryQuantity || 0,
        })),
      });

      // 4. Update Stock Record to complete
      return tx.stockRecord.update({
        where: { id },
        data: {
          isCompleted: true,
          submittedBy: submittedByName,
          submittedAt: new Date(),
        },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        },
      });
    });

    // 5. Generate and send PDF/Slack notifications & auto-draft PO
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
          location: true,
        },
      });

      if (fullRecord) {
        const firstItem = fullRecord.items?.[0]?.item;
        const vendor = firstItem?.vendor;
        const department = vendor?.department;
        const vendorName = vendor?.displayName || 'Unknown Vendor';

        let createdPoId: string | null = null;

        // Draft or update purchase order
        if (vendor) {
          try {
            const existingPo = await this.prisma.purchaseOrder.findFirst({
              where: { stockRecordId: id },
            });

            // Find all location items to get their parLevels
            const locationItems = await this.prisma.locationItem.findMany({
              where: {
                locationId: fullRecord.locationId,
                itemId: { in: fullRecord.items.map((ri) => ri.itemId) },
              },
            });
            const parMap = new Map(
              locationItems.map((li) => [li.itemId, Number(li.parLevel) || 0]),
            );

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
              const countedQty = totalSec + totalBasic / multiplier;

              const roundedNormalized = Math.round(countedQty);
              const roundedPar = Math.round(parLevel);
              const suggestedQty = Math.max(0, roundedPar - roundedNormalized);

              poItemsToCreate.push({
                itemId: ri.itemId,
                quantity: suggestedQty,
                unitName: item.displayUnitName || item.baseUnitName,
                basicQuantity: totalBasic,
                secondaryQuantity: totalSec,
                normalizedQuantity: roundedNormalized,
                parLevel: roundedPar,
                suggestedQuantity: suggestedQty,
              });
            }

            if (!existingPo) {
              // Create Draft PO
              const po = await this.prisma.purchaseOrder.create({
                data: {
                  vendorId: vendor.id,
                  locationId: fullRecord.locationId,
                  stockRecordId: id,
                  createdBy: submittedByName,
                  status: 'DRAFT',
                  notes: '',
                  items: {
                    create: poItemsToCreate,
                  },
                },
              });
              createdPoId = po.id;
            } else {
              // Only update if it's still in DRAFT
              if (existingPo.status === 'DRAFT') {
                // Delete existing items
                await this.prisma.purchaseOrderItem.deleteMany({
                  where: { purchaseOrderId: existingPo.id },
                });

                // Recreate with updated quantities
                await this.prisma.purchaseOrderItem.createMany({
                  data: poItemsToCreate.map((item) => ({
                    ...item,
                    purchaseOrderId: existingPo.id,
                  })),
                });
              }
              createdPoId = existingPo.id;
            }
          } catch (poErr: any) {
            this.logger.error(
              `[StockRecord:${id}] Error auto-drafting purchase order: ${poErr?.message || poErr}`,
              poErr?.stack,
            );
          }
        }

        const botToken = decryptToken(fullRecord.location?.slackBotToken);

        if (botToken) {
          let pdfBuffer: Buffer | null = null;
          const pdfStartTime = Date.now();
          try {
            pdfBuffer = await generateStockRecordPdf({
              ...fullRecord,
              vendorName,
              submittedByName,
            });
            this.logger.log(
              `[StockRecord:${id}] Generated PDF (${pdfBuffer?.length || 0} bytes) in ${Date.now() - pdfStartTime}ms`,
            );
          } catch (pdfErr) {
            this.logger.error(
              `[StockRecord:${id}] Error generating PDF: ${pdfErr?.message || pdfErr}`,
              pdfErr?.stack,
            );
          }

          const safeLocationName = fullRecord.location.name.replace(
            /[^a-zA-Z0-9]/g,
            '_',
          );
          const fileName = `StockAudit_${safeLocationName}_${new Date().toISOString().split('T')[0]}.pdf`;

          // 1. Post to Department or Primary Notification channel
          const primaryChannel = department?.slackChannel || (!fullRecord.slackMessageTs ? vendor?.channelName : null);

          if (primaryChannel) {
            try {
              const resolvedChannelId = await resolveChannelId(
                botToken,
                primaryChannel,
              );

              let message =
                `📄 *Stock Count Audit Submitted*\n` +
                `• *Location:* ${fullRecord.location.name}\n` +
                `• *Vendor:* ${vendorName}\n` +
                `• *Department:* ${department?.fullName || 'N/A'}\n` +
                `• *Submitted By:* ${submittedByName || fullRecord.submittedBy || 'System'}\n` +
                `• *Date:* ${new Date(fullRecord.submittedAt).toLocaleString()}\n\n`;

              if (createdPoId) {
                const frontendUrl =
                  process.env.FRONTEND_URL || 'http://localhost:3000';
                message +=
                  `🛍️ *Auto-Drafted Purchase Order Created*\n` +
                  `• *Status:* DRAFT\n` +
                  `• *Review Link:* <${frontendUrl}/dashboard/admin/reports?poId=${createdPoId}|Review & Approve Purchase Order (Managers/Admins Only)>\n\n`;
              }

              message += `Please find the detailed PDF report attached below.`;

              const postMsgResponse = await fetch(
                'https://slack.com/api/chat.postMessage',
                {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${botToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    channel: resolvedChannelId,
                    text: message,
                  }),
                },
              );

              const postMsgResult: any = await postMsgResponse.json();
              if (postMsgResult.ok && postMsgResult.ts) {
                const responseSlackMessageTs = postMsgResult.ts;

                await this.prisma.stockRecord.update({
                  where: { id },
                  data: { responseSlackMessageTs },
                });
                completedRecord.responseSlackMessageTs = responseSlackMessageTs;

                this.logger.log(
                  `[StockRecord:${id}] Posted Slack message to channel ${resolvedChannelId} (ts: ${responseSlackMessageTs})`,
                );

                if (pdfBuffer) {
                  await uploadPdfToSlackThread(
                    botToken,
                    resolvedChannelId,
                    responseSlackMessageTs,
                    pdfBuffer,
                    fileName,
                    'Attached: Stock Count Audit PDF',
                  ).then(() => {
                    this.logger.log(
                      `[StockRecord:${id}] Successfully uploaded PDF to Slack thread ${responseSlackMessageTs}`,
                    );
                  }).catch((uploadErr) => {
                    this.logger.error(
                      `[StockRecord:${id}] Failed to upload PDF to primary channel thread: ${uploadErr?.message || uploadErr}`,
                      uploadErr?.stack,
                    );
                  });
                }
              } else {
                this.logger.error(
                  `[StockRecord:${id}] Slack chat.postMessage failed: ${postMsgResult.error}`,
                );
              }
            } catch (primarySlackErr) {
              this.logger.error(
                `[StockRecord:${id}] Error posting to primary Slack channel: ${primarySlackErr?.message || primarySlackErr}`,
                primarySlackErr?.stack,
              );
            }
          }

          // 2. Reply to trigger message thread on vendor channel if scheduled
          const vendorChannel = vendor?.channelName;
          if (fullRecord.slackMessageTs && vendorChannel) {
            try {
              const resolvedVendorChannelId = await resolveChannelId(
                botToken,
                vendorChannel,
              );
              const triggerReplyMessage =
                `✅ *Stock Count Completed & Submitted*\n` +
                `• *Submitted By:* ${submittedByName || fullRecord.submittedBy || 'System'}\n` +
                `• *Date:* ${new Date(fullRecord.submittedAt).toLocaleString()}\n\n` +
                `The detailed stock count audit report has been attached to this thread.`;

              if (pdfBuffer) {
                await uploadPdfToSlackThread(
                  botToken,
                  resolvedVendorChannelId,
                  fullRecord.slackMessageTs,
                  pdfBuffer,
                  fileName,
                  triggerReplyMessage,
                ).then(() => {
                  this.logger.log(
                    `[StockRecord:${id}] Successfully replied with PDF to trigger thread ${fullRecord.slackMessageTs}`,
                  );
                }).catch((uploadErr) => {
                  this.logger.error(
                    `[StockRecord:${id}] Failed to upload PDF to schedule thread: ${uploadErr?.message || uploadErr}`,
                    uploadErr?.stack,
                  );
                });
              } else {
                await fetch('https://slack.com/api/chat.postMessage', {
                  method: 'POST',
                  headers: {
                    Authorization: `Bearer ${botToken}`,
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    channel: resolvedVendorChannelId,
                    thread_ts: fullRecord.slackMessageTs,
                    text: triggerReplyMessage,
                  }),
                });
                this.logger.log(
                  `[StockRecord:${id}] Replied with text to trigger thread ${fullRecord.slackMessageTs}`,
                );
              }
            } catch (err) {
              this.logger.error(
                `[StockRecord:${id}] Error sending trigger notification reply: ${err?.message || err}`,
                err?.stack,
              );
            }
          }
        }
      }
    } catch (slackErr) {
      this.logger.error(
        `[StockRecord:${id}] Error in post-completion workflow: ${slackErr?.message || slackErr}`,
        slackErr?.stack,
      );
    }

    return completedRecord;
  }
}
