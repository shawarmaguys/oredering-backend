import { Injectable, NotFoundException, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { decryptToken } from '../common/utils/crypto.util';
import { Schedule } from '@prisma/client';

@Injectable()
export class SchedulesService implements OnModuleInit {
  private readonly logger = new Logger(SchedulesService.name);

  /** In-memory cache of active schedules. Refreshed every hour. */
  private scheduleCache: Schedule[] = [];
  private cacheLastRefreshed: Date | null = null;
  private static readonly CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

  constructor(private readonly prisma: PrismaService) { }

  onModuleInit() {
    // Load cache immediately on startup, then refresh every hour.
    this.refreshScheduleCache();
    setInterval(() => this.refreshScheduleCache(), SchedulesService.CACHE_TTL_MS);

    // Start minute-tick aligned to the next :00 second mark.
    const now = new Date();
    const delay = (60 - now.getSeconds()) * 1000;
    setTimeout(() => {
      this.checkAndTriggerSchedules();
      setInterval(() => this.checkAndTriggerSchedules(), 60 * 1000);
    }, delay);
  }

  /** Fetches all active schedules from DB and stores them in the in-memory cache. */
  private async refreshScheduleCache(): Promise<void> {
    try {
      this.scheduleCache = await this.prisma.schedule.findMany({
        where: { isActive: true },
      });
      this.cacheLastRefreshed = new Date();
      this.logger.log(
        `[ScheduleCache] Refreshed — ${this.scheduleCache.length} active schedule(s) cached at ${this.cacheLastRefreshed.toISOString()}`,
      );
    } catch (err: any) {
      this.logger.error(
        `[ScheduleCache] Failed to refresh schedule cache: ${err?.message || err}`,
        err?.stack,
      );
    }
  }

  /** Invalidates the cache immediately (e.g., after a mutation). */
  private async invalidateScheduleCache(): Promise<void> {
    await this.refreshScheduleCache();
  }

  async checkAndTriggerSchedules() {
    const now = new Date();
    const currentHour = now.getHours().toString().padStart(2, '0');
    const currentMinute = now.getMinutes().toString().padStart(2, '0');
    const currentTimeStr = `${currentHour}:${currentMinute}`;
    const currentDayOfWeek = now.getDay(); // 0 = Sunday, 1 = Monday, etc.

    // Use in-memory cache — no DB call on every tick.
    const candidates = this.scheduleCache.filter((schedule) => {
      const [schedHour, schedMin] = schedule.triggerTime.split(':');
      const schedTimeStr = `${schedHour.padStart(2, '0')}:${schedMin.padStart(2, '0')}`;
      if (schedTimeStr !== currentTimeStr) return false;
      return (
        schedule.scheduleType === 'DAILY' ||
        (schedule.scheduleType === 'WEEKLY' && schedule.dayOfWeek === currentDayOfWeek)
      );
    });

    for (const schedule of candidates) {
      this.logger.log(`[Cron Scheduler] Triggering schedule ${schedule.id} at ${currentTimeStr}`);
      await this.trigger(schedule.id).catch((err: any) => {
        this.logger.error(
          `[Cron Scheduler] Failed to trigger schedule ${schedule.id}: ${err?.message || err}`,
          err?.stack,
        );
      });
    }
  }

  async create(createScheduleDto: CreateScheduleDto) {
    const { locationId, vendorId, ...scheduleData } = createScheduleDto;
    this.logger.log(`[SchedulesService] Creating schedule for vendor ${vendorId} at location ${locationId} (${scheduleData.scheduleType} at ${scheduleData.triggerTime})`);

    // Verify location
    const location = await this.prisma.location.findUnique({
      where: { id: locationId },
    });
    if (!location) {
      this.logger.warn(`[SchedulesService] Location with ID ${locationId} not found`);
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    // Verify vendor
    const vendor = await this.prisma.vendor.findUnique({
      where: { id: vendorId },
    });
    if (!vendor) {
      this.logger.warn(`[SchedulesService] Vendor with ID ${vendorId} not found`);
      throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
    }

    const created = await this.prisma.schedule.create({
      data: {
        ...scheduleData,
        locationId,
        vendorId,
      },
    });
    this.logger.log(`[SchedulesService] Created schedule "${created.id}"`);

    // Invalidate cache so the new schedule is picked up immediately.
    await this.invalidateScheduleCache();
    return created;
  }

  async findAll() {
    return this.prisma.schedule.findMany({
      include: {
        location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        vendor: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deactivateByLocation(locationId: string) {
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    await this.prisma.schedule.updateMany({
      where: { locationId },
      data: { isActive: false },
    });
    await this.invalidateScheduleCache();

    return { success: true, message: `All triggers deactivated for location ${location.name}` };
  }

  async activateByLocation(locationId: string) {
    const location = await this.prisma.location.findUnique({ where: { id: locationId } });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    await this.prisma.schedule.updateMany({
      where: { locationId },
      data: { isActive: true },
    });
    await this.invalidateScheduleCache();

    return { success: true, message: `All triggers activated for location ${location.name}` };
  }

  async deactivateByVendor(vendorId: string, locationId?: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
    }

    const where: any = { vendorId };
    if (locationId && locationId !== 'all') {
      where.locationId = locationId;
    }

    await this.prisma.schedule.updateMany({
      where,
      data: { isActive: false },
    });
    await this.invalidateScheduleCache();

    return { success: true, message: `All triggers deactivated for vendor ${vendor.displayName}` };
  }

  async activateByVendor(vendorId: string, locationId?: string) {
    const vendor = await this.prisma.vendor.findUnique({ where: { id: vendorId } });
    if (!vendor) {
      throw new NotFoundException(`Vendor with ID ${vendorId} not found`);
    }

    const where: any = { vendorId };
    if (locationId && locationId !== 'all') {
      where.locationId = locationId;
    }

    await this.prisma.schedule.updateMany({
      where,
      data: { isActive: true },
    });
    await this.invalidateScheduleCache();

    return { success: true, message: `All triggers activated for vendor ${vendor.displayName}` };
  }

  async update(id: string, updateScheduleDto: any) {
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }

    if (updateScheduleDto.locationId) {
      const location = await this.prisma.location.findUnique({ where: { id: updateScheduleDto.locationId } });
      if (!location) throw new NotFoundException(`Location with ID ${updateScheduleDto.locationId} not found`);
    }

    if (updateScheduleDto.vendorId) {
      const vendor = await this.prisma.vendor.findUnique({ where: { id: updateScheduleDto.vendorId } });
      if (!vendor) throw new NotFoundException(`Vendor with ID ${updateScheduleDto.vendorId} not found`);
    }

    const updated = await this.prisma.schedule.update({
      where: { id },
      data: updateScheduleDto,
      include: {
        location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        vendor: true,
      },
    });
    await this.invalidateScheduleCache();
    return updated;
  }

  async remove(id: string) {
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) {
      throw new NotFoundException(`Schedule with ID ${id} not found`);
    }
    const removed = await this.prisma.schedule.update({
      where: { id },
      data: { isActive: false },
    });
    await this.invalidateScheduleCache();
    return removed;
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

    // 1. Fetch active location items for this vendor (primary or backup)
    const locationItems = await this.prisma.locationItem.findMany({
      where: {
        locationId: schedule.locationId,
        isActive: true,
        item: {
          isActive: true,
          OR: [
            { vendorId: schedule.vendorId },
            { backupVendors: { some: { vendorId: schedule.vendorId } } }
          ]
        },
      },
      include: {
        item: true,
      },
    });

    locationItems.sort((a, b) =>
      (a.item?.displayName || '').localeCompare(b.item?.displayName || '', undefined, { sensitivity: 'base' })
    );

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

      await tx.stockRecordItem.createMany({
        data: locationItems.map((locItem) => ({
          stockRecordId: stockRecord.id,
          itemId: locItem.itemId,
          basicQuantity: 0,
          secondaryQuantity: 0,
        })),
      });

      // 3. Send Slack Message if configured on both location and schedule
      let slackMessageTs: string | null = null;
      const slackChannel = schedule.vendor?.channelName;
      const botToken = decryptToken(schedule.location?.slackBotToken);

      if (botToken && slackChannel) {
        try {
          const frontendUrl = process.env.FRONTEND_URL;
          const formUrl = `${frontendUrl}/dashboard?recordId=${stockRecord.id}`;
          const text = `🔔 *New Stock Count* 🔔\n` +
            `A new stock count has been initiated for *${schedule.location.name}* (Vendor: *${schedule.vendor.displayName}*).\n` +
            `Please complete the stock count as soon as possible.\n` +
            `*<${formUrl}|Click here to open the Stock Recording Form>*`;

          const targetChannel = slackChannel.startsWith('#') ? slackChannel : `#${slackChannel}`;
          const response = await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${botToken}`,
            },
            body: JSON.stringify({
              channel: targetChannel,
              text,
            }),
          });

          const resData: any = await response.json();
          if (resData.ok) {
            slackMessageTs = resData.ts;
            this.logger.log(
              `[Schedule:${id}] Sent schedule trigger Slack message to ${targetChannel} (ts: ${slackMessageTs})`,
            );
          } else {
            this.logger.error(
              `[Schedule:${id}] Slack API error sending trigger message to ${targetChannel}: ${resData.error}`,
            );
          }
        } catch (slackErr: any) {
          this.logger.error(
            `[Schedule:${id}] Failed to send Slack trigger message: ${slackErr?.message || slackErr}`,
            slackErr?.stack,
          );
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
          location: { select: { id: true, name: true, address: true, email: true, phone: true, createdAt: true } },
        },
      });
    });
  }
}
