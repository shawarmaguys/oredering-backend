import { Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';

@Injectable()
export class SchedulesService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  onModuleInit() {
    // Start interval to check schedules every minute
    // Align with the next minute boundary so it checks near the 00 second mark.
    const now = new Date();
    const delay = (60 - now.getSeconds()) * 1000;
    
    setTimeout(() => {
      this.checkAndTriggerSchedules();
      setInterval(() => {
        this.checkAndTriggerSchedules();
      }, 60 * 1000);
    }, delay);
  }

  async checkAndTriggerSchedules() {
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    try {
      const activeSchedules = await this.prisma.schedule.findMany({
        where: { isActive: true },
      });

      for (const schedule of activeSchedules) {
        // Parse time to match
        const [schedHour, schedMin] = schedule.triggerTime.split(':');
        const schedTimeStr = `${schedHour.padStart(2, '0')}:${schedMin.padStart(2, '0')}`;

        if (schedTimeStr === currentTimeStr) {
          if (
            schedule.scheduleType === 'DAILY' ||
            (schedule.scheduleType === 'WEEKLY' && schedule.dayOfWeek === currentDayOfWeek)
          ) {
            console.log(`[Cron Scheduler] Triggering schedule ${schedule.id} at ${currentTimeStr}`);
            await this.trigger(schedule.id).catch((err) => {
              console.error(`[Cron Scheduler] Failed to trigger schedule ${schedule.id}:`, err);
            });
          }
        }
      }
    } catch (err) {
      console.error('[Cron Scheduler] Error running schedule checks:', err);
    }
  }

  async create(createScheduleDto: CreateScheduleDto) {
    const { locationId, vendorId, ...scheduleData } = createScheduleDto;

    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Verify vendor
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
    }

    return this.prisma.schedule.create({
      data: {
        ...scheduleData,
        locationId,
        vendorId,
      },
    });
  }

  async findAll() {
    return this.prisma.schedule.findMany({
      include: {
        location: true,
        vendor: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async trigger(id: string) {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id },
      include: {
        location: true,
        vendor: true,
      },
    });

    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }

    // 1. Fetch active location items for this vendor
    const locationItems = await this.prisma.locationItem.findMany({
      where: {
        locationId: schedule.locationId,
        isActive: true,
        item: {
          vendorId: schedule.vendorId,
          isActive: true,
        },
      },
      include: {
        item: true,
      },
    });

    // 2. Create Stock Record (draft/incomplete) in a transaction
    return this.prisma.$transaction(async (tx) => {

      const stockRecord = await tx.stockRecord.create({
        data: {
          locationId: schedule.locationId,
          isCompleted: false,
          submittedBy: null,
          submittedAt: new Date(),
        },
      });

      // Create StockRecordItems with 0/placeholder quantities
      for (const locItem of locationItems) {

        await tx.stockRecordItem.create({
          data: {
            stockRecordId: stockRecord.id,
            itemId: locItem.itemId,
            enteredQuantity: 0,
            enteredUnit: locItem.item.baseUnitName || 'pcs',
            normalizedQuantity: 0,
          },
        });
      }

      // 3. Send Slack Message if configured on both location and schedule
      let slackMessageTs: string | null = null;
      const slackChannel = schedule.vendor?.channelName;
      const botToken = schedule.location?.slackBotToken;

      console.log(botToken, 'botToken');
      console.log(slackChannel, 'slackChannel');

      if (botToken && slackChannel) {
        try {
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
          const formUrl = `${frontendUrl}/dashboard?recordId=${stockRecord.id}`;
          console.log(formUrl, 'formUrl');
          const text = `🔔 *PLEASE IGNORE THIS TEST MESSAGE* 🔔\n` +
            `A new stock record count has been initiated for *${schedule.location.name}* (Vendor: *${schedule.vendor.displayName}*).\n` +
            `Please complete the stock recording as soon as possible.\n` +
            `• *Record ID:* \`${stockRecord.id}\`\n` +
            `• *Channel:* #${slackChannel}\n\n` +
            `👉 *<${formUrl}|Click here to open the Stock Recording Form>*`;

          const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${botToken}`,
            },
            body: JSON.stringify({
              channel: slackChannel.startsWith('#') ? slackChannel : `#${slackChannel}`,
              text,
            }),
          });

          // console.log("response", response);

          const resData: any = await response.json();
          if (resData.ok) {
            slackMessageTs = resData.ts;
          } else {
            console.error('Slack API error:', resData.error);
          }
        } catch (slackErr) {
          console.error('Failed to send slack message:', slackErr);
        }
      }

      // Update StockRecord with slack timestamp if successfully sent
      if (slackMessageTs) {
        await tx.stockRecord.update({
          where: { id: stockRecord.id },
          data: { slackMessageTs },
        });
      }

      return tx.stockRecord.findUnique({
        where: { id: stockRecord.id },
        include: {
          items: {
            include: {
              item: true,
            },
          },
          location: true,
        },
      });
    });
  }
}
